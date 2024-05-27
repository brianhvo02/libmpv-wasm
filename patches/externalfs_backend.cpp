#include <emscripten/threading.h>
#include <stdlib.h>

#include "backend.h"
#include "file.h"
#include "externalfs_backend.h"
#include "support.h"
#include "thread_utils.h"
#include "wasmfs.h"

using namespace wasmfs;

namespace {

using ProxyWorker = emscripten::ProxyWorker;
using ProxyingQueue = emscripten::ProxyingQueue;

class Worker {
public:
#ifdef __EMSCRIPTEN_PTHREADS__
  ProxyWorker proxy;

  template<typename T> void operator()(T func) { proxy(func); }
#else
  // When used with JSPI on the main thread the various wasmfs_externalfs_* functions
  // can be directly executed since they are all async.
  template<typename T> void operator()(T func) {
    if constexpr (std::is_invocable_v<T&, ProxyingQueue::ProxyingCtx>) {
      // TODO: Find a way to remove this, since it's unused.
      ProxyingQueue::ProxyingCtx p;
      func(p);
    } else {
      func();
    }
  }
#endif
};

class OpenState {
public:
  enum Kind { None, Blob };

private:
  Kind kind = None;
  int id = -1;
  size_t openCount = 0;

public:
  Kind getKind() { return kind; }

  int open(Worker& proxy, int fileID, oflags_t flags) {
    if (kind == None) {
      assert(openCount == 0);
      switch (flags) {
        case O_RDONLY:
          // We only need read access, so open as a Blob
          proxy(
            [&](auto ctx) { _wasmfs_externalfs_open_blob(ctx.ctx, fileID, &id); });
          if (id < 0) {
            return id;
          }
          kind = Blob;
          break;
        default:
          WASMFS_UNREACHABLE("Unexpected open access mode");
      }
    }
    ++openCount;
    return 0;
  }

  int close(Worker& proxy) {
    // TODO: Downgrade to Blob access once the last writable file descriptor has
    // been closed.
    int err = 0;
    if (--openCount == 0) {
      switch (kind) {
        case Blob:
          proxy([&]() { _wasmfs_externalfs_close_blob(id); });
          break;
        case None:
          WASMFS_UNREACHABLE("Open file should have kind");
      }
      kind = None;
      id = -1;
    }
    return err;
  }

  int getBlobID() {
    assert(openCount > 0);
    assert(id >= 0);
    assert(kind == Blob);
    return id;
  }
};

class ExternalFSFile : public DataFile {
public:
  Worker& proxy;
  int fileID;
  OpenState state;

  ExternalFSFile(mode_t mode, backend_t backend, int fileID, Worker& proxy)
    : DataFile(mode, backend), proxy(proxy), fileID(fileID) {}

  ~ExternalFSFile() override {
    assert(state.getKind() == OpenState::None);
    proxy([&]() { _wasmfs_externalfs_free_file(fileID); });
  }

private:
  off_t getSize() override {
    off_t size;
    switch (state.getKind()) {
      case OpenState::None:
        proxy([&](auto ctx) {
          _wasmfs_externalfs_get_size_file(ctx.ctx, fileID, &size);
        });
        break;
      case OpenState::Blob:
        proxy([&]() { size = _wasmfs_externalfs_get_size_blob(state.getBlobID()); });
        break;
      default:
        WASMFS_UNREACHABLE("Unexpected open state");
    }
    return size;
  }

  int setSize(off_t size) override {
    WASMFS_UNREACHABLE("Unexpected open state");
  }

  int open(oflags_t flags) override { return state.open(proxy, fileID, flags); }

  int close() override { return state.close(proxy); }

  ssize_t read(uint8_t* buf, size_t len, off_t offset) override {
    // TODO: use an i64 here.
    int32_t nread;
    switch (state.getKind()) {
      case OpenState::Blob:
        proxy([&](auto ctx) {
          _wasmfs_externalfs_read_blob(
            ctx.ctx, state.getBlobID(), buf, len, offset, &nread);
        });
        break;
      case OpenState::None:
      default:
        WASMFS_UNREACHABLE("Unexpected open state");
    }
    return nread;
  }

  ssize_t write(const uint8_t* buf, size_t len, off_t offset) override {
    WASMFS_UNREACHABLE("Unexpected open state");
  }

  int flush() override {
    int err = 0;
    switch (state.getKind()) {
      case OpenState::Blob:
      case OpenState::None:
      default:
        break;
    }
    return err;
  }
};

class ExternalFSDirectory : public Directory {
public:
  Worker& proxy;

  // The ID of this directory in the JS library.
  int dirID = 0;

  ExternalFSDirectory(mode_t mode, backend_t backend, int dirID, Worker& proxy)
    : Directory(mode, backend), proxy(proxy), dirID(dirID) {}

  ~ExternalFSDirectory() override {
    // Never free the root directory ID.
    if (dirID != 0) {
      proxy([&]() { _wasmfs_externalfs_free_directory(dirID); });
    }
  }

private:
  std::shared_ptr<File> getChild(const std::string& name) override {
    int childType = 0, childID = 0;
    proxy([&](auto ctx) {
      _wasmfs_externalfs_get_child(
        ctx.ctx, dirID, name.c_str(), &childType, &childID);
    });
    if (childID == -1) {
      WASMFS_UNREACHABLE("No directory mounted.");
    } else if (childID < -1) {
      // TODO: More fine-grained error reporting.
      return NULL;
    }
    if (childType == 1) {
      return std::make_shared<ExternalFSFile>(0777, getBackend(), childID, proxy);
    } else if (childType == 2) {
      return std::make_shared<ExternalFSDirectory>(
        0777, getBackend(), childID, proxy);
    } else {
      WASMFS_UNREACHABLE("Unexpected child type");
    }
  }

  std::shared_ptr<DataFile> insertDataFile(const std::string& name,
                                           mode_t mode) override {
    return nullptr;
  }

  std::shared_ptr<Directory> insertDirectory(const std::string& name,
                                             mode_t mode) override {
    return nullptr;
  }

  std::shared_ptr<Symlink> insertSymlink(const std::string& name,
                                         const std::string& target) override {
    // Symlinks not supported.
    // TODO: Propagate EPERM specifically.
    return nullptr;
  }

  int insertMove(const std::string& name, std::shared_ptr<File> file) override {
    return -1;
  }

  int removeChild(const std::string& name) override {
    return -1;
  }

  ssize_t getNumEntries() override {
    auto entries = getEntries();
    if (int err = entries.getError()) {
      return err;
    }
    return entries->size();
  }

  Directory::MaybeEntries getEntries() override {
    std::vector<Directory::Entry> entries;
    int err = 0;
    proxy([&](auto ctx) {
      _wasmfs_externalfs_get_entries(ctx.ctx, dirID, &entries, &err);
    });
    if (err) {
      assert(err < 0);
      return {err};
    }
    return {entries};
  }
};

class ExternalFSBackend : public Backend {
public:
  Worker proxy;

  std::shared_ptr<DataFile> createFile(mode_t mode) override {
    // No way to support a raw file without a parent directory.
    // TODO: update the core system to document this as a possible result of
    // `createFile` and to handle it gracefully.
    return nullptr;
  }

  std::shared_ptr<Directory> createDirectory(mode_t mode) override {
    proxy([](auto ctx) {
      printf("extfs pid: %d\n", (int)pthread_self());
      _wasmfs_externalfs_init_root_directory(ctx.ctx);
    });
    return std::make_shared<ExternalFSDirectory>(mode, this, 1, proxy);
  }

  std::shared_ptr<Symlink> createSymlink(std::string target) override {
    // Symlinks not supported.
    return nullptr;
  }
};

} // anonymous namespace

extern "C" {

backend_t wasmfs_create_externalfs_backend() {
  // ProxyWorker cannot safely be synchronously spawned from the main browser
  // thread. See comment in thread_utils.h for more details.
  assert(
    !emscripten_is_main_browser_thread() ||
    emscripten_has_asyncify() == 2 &&
      "Cannot safely create ExternalFS backend on main browser thread without JSPI");

  return wasmFS.addBackend(std::make_unique<ExternalFSBackend>());
}

void EMSCRIPTEN_KEEPALIVE _wasmfs_externalfs_record_entry(
  std::vector<Directory::Entry>* entries, const char* name, int type) {
  entries->push_back({name, File::FileKind(type), 0});
}

} // extern "C"

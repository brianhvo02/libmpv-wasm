#include <vector>

#include <emscripten/proxying.h>

#include "backend.h"

using namespace wasmfs;

extern "C" {

// Ensure that the root OPFS directory is initialized with ID 0.
void _wasmfs_externalfs_init_root_directory(em_proxying_ctx* ctx);

// Look up the child under `parent` with `name`. Write 1 to `child_type` if it's
// a regular file or 2 if it's a directory. Write the child's file or directory
// ID to `child_id`, or -1 if the child does not exist, or -2 if the child
// exists but cannot be opened.
void _wasmfs_externalfs_get_child(em_proxying_ctx* ctx,
                            int parent,
                            const char* name,
                            int* child_type,
                            int* child_id);

void _wasmfs_externalfs_get_entries(em_proxying_ctx* ctx,
                              int dirID,
                              std::vector<Directory::Entry>* entries,
                              int* err);

void _wasmfs_externalfs_open_blob(em_proxying_ctx* ctx, int file_id, int* blob_id);

void _wasmfs_externalfs_close_blob(int blob_id);

void _wasmfs_externalfs_free_file(int file_id);

void _wasmfs_externalfs_free_directory(int dir_id);

int _wasmfs_externalfs_read_blob(em_proxying_ctx* ctx,
                           int blob_id,
                           uint8_t* buf,
                           uint32_t len,
                           off_t pos,
                           int32_t* nread);

// TODO: return 64-byte off_t.
off_t _wasmfs_externalfs_get_size_blob(int blob_id);

// Get the size of a file handle via a File Blob.
void _wasmfs_externalfs_get_size_file(em_proxying_ctx* ctx, int file_id, off_t* size);

} // extern "C"

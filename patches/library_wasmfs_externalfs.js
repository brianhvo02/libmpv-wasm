addToLibrary({
  $wasmfsExternalFSDirectoryHandles__deps: ['$HandleAllocator'],
  $wasmfsExternalFSDirectoryHandles: "new HandleAllocator()",
  $wasmfsExternalFSFileHandles__deps: ['$HandleAllocator'],
  $wasmfsExternalFSFileHandles: "new HandleAllocator()",
  $wasmfsExternalFSAccessHandles__deps: ['$HandleAllocator'],
  $wasmfsExternalFSAccessHandles: "new HandleAllocator()",
  $wasmfsExternalFSBlobs__deps: ["$HandleAllocator"],
  $wasmfsExternalFSBlobs: "new HandleAllocator()",

  $wasmfsExternalFSProxyFinish__deps: ['emscripten_proxy_finish'],
  $wasmfsExternalFSProxyFinish: (ctx) => {
    // When using pthreads the proxy needs to know when the work is finished.
    // When used with JSPI the work will be executed in an async block so there
    // is no need to notify when done.
    _emscripten_proxy_finish(ctx);
  },

  _wasmfs_externalfs_init_root_directory__deps: ['$wasmfsExternalFSDirectoryHandles', '$wasmfsExternalFSProxyFinish'],
  _wasmfs_externalfs_init_root_directory: async function(ctx) {
    // allocated.length starts off as 1 since 0 is a reserved handle
    if (wasmfsExternalFSDirectoryHandles.allocated.length == 1) {
      addEventListener('message', e => {
        wasmfsExternalFSDirectoryHandles.allocated = [wasmfsExternalFSDirectoryHandles.allocated[0], e.data];
      });
      // Closure compiler errors on this as it does not recognize the OPFS
      // API yet, it seems. Unfortunately an existing annotation for this is in
      // the closure compiler codebase, and cannot be overridden in user code
      // (it complains on a duplicate type annotation), so just suppress it.
      /** @suppress {checkTypes} */
      // let root = await navigator.storage.getDirectory();
      // wasmfsExternalFSDirectoryHandles.allocated.push(root);
    }
    wasmfsExternalFSProxyFinish(ctx);
  },

  // Return the file ID for the file with `name` under `parent`, creating it if
  // it doesn't exist and `create` or otherwise return a negative error code
  // corresponding to the error.
  $wasmfsExternalFSGetOrCreateFile__deps: ['$wasmfsExternalFSDirectoryHandles',
                                     '$wasmfsExternalFSFileHandles'],
  $wasmfsExternalFSGetOrCreateFile: async function(parent, name, create) {
    let parentHandle = wasmfsExternalFSDirectoryHandles.get(parent);
    let fileHandle;
    try {
      fileHandle = await parentHandle.getFileHandle(name, {create: create});
    } catch (e) {
      if (e.name === "NotFoundError") {
        return -{{{ cDefs.EEXIST }}};
      }
      if (e.name === "TypeMismatchError") {
        return -{{{ cDefs.EISDIR }}};
      }
#if ASSERTIONS
      err('unexpected error:', e, e.stack);
#endif
      return -{{{ cDefs.EIO }}};
    }
    return wasmfsExternalFSFileHandles.allocate(fileHandle);
  },

  // Return the file ID for the directory with `name` under `parent`, creating
  // it if it doesn't exist and `create` or otherwise return a negative error
  // code corresponding to the error.
  $wasmfsExternalFSGetOrCreateDir__deps: ['$wasmfsExternalFSDirectoryHandles'],
  $wasmfsExternalFSGetOrCreateDir: async function(parent, name, create) {
    let parentHandle = wasmfsExternalFSDirectoryHandles.get(parent);
    let childHandle;
    try {
      childHandle =
          await parentHandle.getDirectoryHandle(name, {create: create});
    } catch (e) {
      if (e.name === "NotFoundError") {
        return -{{{ cDefs.EEXIST }}};
      }
      if (e.name === "TypeMismatchError") {
        return -{{{ cDefs.ENOTDIR }}};
      }
#if ASSERTIONS
      err('unexpected error:', e, e.stack);
#endif
      return -{{{ cDefs.EIO }}};
    }
    return wasmfsExternalFSDirectoryHandles.allocate(childHandle);
  },

  _wasmfs_externalfs_get_child__deps: ['$wasmfsExternalFSGetOrCreateFile',
                                 '$wasmfsExternalFSGetOrCreateDir', '$wasmfsExternalFSProxyFinish'],
  _wasmfs_externalfs_get_child:
      async function(ctx, parent, namePtr, childTypePtr, childIDPtr) {
    if (!wasmfsExternalFSDirectoryHandles.allocated[parent]) {
      let childID = -1;
      {{{ makeSetValue('childIDPtr', 0, 'childID', 'i32') }}};
      return wasmfsExternalFSProxyFinish(ctx);
    }
    let name = UTF8ToString(namePtr);
    let childType = 1;
    let childID = await wasmfsExternalFSGetOrCreateFile(parent, name, false);
    if (childID == -{{{ cDefs.EISDIR }}}) {
      childType = 2;
      childID = await wasmfsExternalFSGetOrCreateDir(parent, name, false);
    }
    {{{ makeSetValue('childTypePtr', 0, 'childType', 'i32') }}};
    {{{ makeSetValue('childIDPtr', 0, 'childID', 'i32') }}};
    wasmfsExternalFSProxyFinish(ctx);
  },

  _wasmfs_externalfs_get_entries__deps: [
    '$wasmfsExternalFSProxyFinish',
    '$stackSave',
    '$stackRestore',
    '_wasmfs_externalfs_record_entry',
  ],
  _wasmfs_externalfs_get_entries: async function(ctx, dirID, entriesPtr, errPtr) {
    let dirHandle = wasmfsExternalFSDirectoryHandles.get(dirID);

    // TODO: Use 'for await' once Acorn supports that.
    try {
      let iter = dirHandle.entries();
      for (let entry; entry = await iter.next(), !entry.done;) {
        let [name, child] = entry.value;
        let sp = stackSave();
        let namePtr = stringToUTF8OnStack(name);
        let type = child.kind == "file" ?
            {{{ cDefine('File::DataFileKind') }}} :
        {{{ cDefine('File::DirectoryKind') }}};
          __wasmfs_externalfs_record_entry(entriesPtr, namePtr, type)
        stackRestore(sp);
      }
    } catch {
      let err = -{{{ cDefs.EIO }}};
      {{{ makeSetValue('errPtr', 0, 'err', 'i32') }}};
    }
    wasmfsExternalFSProxyFinish(ctx);
  },

  _wasmfs_externalfs_free_file__deps: ['$wasmfsExternalFSFileHandles'],
  _wasmfs_externalfs_free_file: (fileID) => {
    wasmfsExternalFSFileHandles.free(fileID);
  },

  _wasmfs_externalfs_free_directory__deps: ['$wasmfsExternalFSDirectoryHandles'],
  _wasmfs_externalfs_free_directory: (dirID) => {
    wasmfsExternalFSDirectoryHandles.free(dirID);
  },

  _wasmfs_externalfs_open_blob__deps: ['$wasmfsExternalFSFileHandles',
                                 '$wasmfsExternalFSBlobs', '$wasmfsExternalFSProxyFinish'],
  _wasmfs_externalfs_open_blob: async function(ctx, fileID, blobIDPtr) {
    let fileHandle = wasmfsExternalFSFileHandles.get(fileID);
    let blobID;
    try {
      let blob = await fileHandle.getFile();
      blobID = wasmfsExternalFSBlobs.allocate(blob);
    } catch (e) {
      if (e.name === "NotAllowedError") {
        blobID = -{{{ cDefs.EACCES }}};
      } else {
#if ASSERTIONS
        err('unexpected error:', e, e.stack);
#endif
        blobID = -{{{ cDefs.EIO }}};
      }
    }
    {{{ makeSetValue('blobIDPtr', 0, 'blobID', 'i32') }}};
    wasmfsExternalFSProxyFinish(ctx);
  },

  _wasmfs_externalfs_close_blob__deps: ['$wasmfsExternalFSBlobs'],
  _wasmfs_externalfs_close_blob: (blobID) => {
    wasmfsExternalFSBlobs.free(blobID);
  },

  _wasmfs_externalfs_read_blob__deps: ['$wasmfsExternalFSBlobs', '$wasmfsExternalFSProxyFinish'],
  _wasmfs_externalfs_read_blob: async function(ctx, blobID, bufPtr, len, pos, nreadPtr) {
    let blob = wasmfsExternalFSBlobs.get(blobID);
    let slice = blob.slice(Number(pos), Number(pos) + len);
    let nread = 0;

    try {
      // TODO: Use ReadableStreamBYOBReader once
      // https://bugs.chromium.org/p/chromium/issues/detail?id=1189621 is
      // resolved.
      let buf = await slice.arrayBuffer();
      let data = new Uint8Array(buf);
      HEAPU8.set(data, bufPtr);
      nread += data.length;
    } catch (e) {
      if (e instanceof RangeError) {
        nread = -{{{ cDefs.EFAULT }}};
      } else {
#if ASSERTIONS
        err('unexpected error:', e, e.stack);
#endif
        nread = -{{{ cDefs.EIO }}};
      }
    }

    {{{ makeSetValue('nreadPtr', 0, 'nread', 'i32') }}};
    wasmfsExternalFSProxyFinish(ctx);
  },

  _wasmfs_externalfs_get_size_blob__deps: ['$wasmfsExternalFSBlobs'],
  _wasmfs_externalfs_get_size_blob: (blobID) => {
    // This cannot fail.
    return BigInt(wasmfsExternalFSBlobs.get(blobID).size);
  },

  _wasmfs_externalfs_get_size_file__deps: ['$wasmfsExternalFSFileHandles', '$wasmfsExternalFSProxyFinish'],
  _wasmfs_externalfs_get_size_file: async function(ctx, fileID, sizePtr) {
    let fileHandle = wasmfsExternalFSFileHandles.get(fileID);
    let size;
    try {
      size = (await fileHandle.getFile()).size;
    } catch {
      size = -{{{ cDefs.EIO }}};
    }
    {{{ makeSetValue('sizePtr', 0, 'size', 'i64') }}};
    wasmfsExternalFSProxyFinish(ctx);
  }
});

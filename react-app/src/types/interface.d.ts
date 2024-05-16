// TypeScript bindings for emscripten-generated code.  Automatically generated at compile time.
declare namespace RuntimeExports {
    namespace FS {
        function init(): void;
        let ErrnoError: any;
        function handleError(returnValue: any): any;
        function ensureErrnoError(): void;
        function createDataFile(parent: any, name: any, fileData: any, canRead: any, canWrite: any, canOwn: any): void;
        function createPath(parent: any, path: any, canRead: any, canWrite: any): any;
        function createPreloadedFile(parent: any, name: any, url: any, canRead: any, canWrite: any, onload: any, onerror: any, dontCreateFile: any, canOwn: any, preFinish: any): any;
        function readFile(path: any, opts?: {}): Uint8Array;
        function cwd(): any;
        function analyzePath(path: any): {
            exists: boolean;
            object: {
                contents: any;
            };
        };
        function mkdir(path: any, mode: any): any;
        function mkdirTree(path: any, mode: any): any;
        function rmdir(path: any): any;
        function open(path: any, flags: any, mode: any): any;
        function create(path: any, mode: any): any;
        function close(stream: any): any;
        function unlink(path: any): any;
        function chdir(path: any): any;
        function read(stream: any, buffer: any, offset: any, length: any, position: any): any;
        function write(stream: any, buffer: any, offset: any, length: any, position: any, canOwn: any): any;
        function allocate(stream: any, offset: any, length: any): any;
        function writeFile(path: any, data: any): any;
        function mmap(stream: any, length: any, offset: any, prot: any, flags: any): {
            ptr: any;
            allocated: boolean;
        };
        function msync(stream: any, bufferPtr: any, offset: any, length: any, mmapFlags: any): any;
        function munmap(addr: any, length: any): any;
        function symlink(target: any, linkpath: any): any;
        function readlink(path: any): any;
        function statBufToObject(statBuf: any): {
            dev: any;
            mode: any;
            nlink: any;
            uid: any;
            gid: any;
            rdev: any;
            size: any;
            blksize: any;
            blocks: any;
            atime: any;
            mtime: any;
            ctime: any;
            ino: any;
        };
        function stat(path: any): any;
        function lstat(path: any): any;
        function chmod(path: any, mode: any): any;
        function lchmod(path: any, mode: any): any;
        function fchmod(fd: any, mode: any): any;
        function utime(path: any, atime: any, mtime: any): any;
        function truncate(path: any, len: any): any;
        function ftruncate(fd: any, len: any): any;
        function findObject(path: any): {
            isFolder: boolean;
            isDevice: boolean;
        };
        function readdir(path: any): any;
        function mount(type: any, opts: any, mountpoint: any): any;
        function unmount(mountpoint: any): any;
        function mknod(path: any, mode: any, dev: any): any;
        function makedev(ma: any, mi: any): number;
        function registerDevice(dev: any, ops: any): void;
        function createDevice(parent: any, name: any, input: any, output: any): any;
        function mkdev(path: any, mode: any, dev: any): any;
        function rename(oldPath: any, newPath: any): any;
        function llseek(stream: any, offset: any, whence: any): any;
    }
    namespace PThread {
        let unusedWorkers: any[];
        let runningWorkers: any[];
        let tlsInitFunctions: any[];
        let pthreads: {};
        let nextWorkerID: number;
        function debugInit(): void;
        function init(): void;
        function initMainThread(): void;
        function initWorker(): void;
        function setExitStatus(status: any): any;
        let terminateAllThreads__deps: string[];
        function terminateAllThreads(): void;
        function returnWorkerToPool(worker: any): void;
        function receiveObjectTransfer(data: any): void;
        function threadInitTLS(): void;
        function loadWasmModuleToWorker(worker: any): Promise<any>;
        function loadWasmModuleToAllWorkers(onMaybeReady: any): any;
        function allocateUnusedWorker(): void;
        function getNewWorker(): any;
    }
    let HEAPF32: any;
    let HEAPF64: any;
    let HEAP_DATA_VIEW: any;
    let HEAP8: any;
    let HEAPU8: any;
    let HEAP16: any;
    let HEAPU16: any;
    let HEAP32: any;
    let HEAPU32: any;
    let HEAP64: any;
    let HEAPU64: any;
    let FS_createPath: any;
    function FS_createDataFile(parent: any, name: any, fileData: any, canRead: any, canWrite: any, canOwn: any): void;
    function FS_createPreloadedFile(parent: any, name: any, url: any, canRead: any, canWrite: any, onload: any, onerror: any, dontCreateFile: any, canOwn: any, preFinish: any): void;
    function FS_unlink(path: any): any;
    let addRunDependency: any;
    let removeRunDependency: any;
}
interface WasmModule {
  _main(_0: number, _1: number): number;
  __emscripten_proxy_main(_0: number, _1: number): number;
}

type EmbindString = ArrayBuffer|Uint8Array|Uint8ClampedArray|Int8Array|string;
interface EmbindModule {
  mpvInit(): void;
  loadFile(_0: EmbindString): void;
  togglePlay(): void;
  setPlaybackTime(_0: number): void;
  setVolume(_0: number): void;
  readdir(): void;
  getTracks(): void;
  setVideoTrack(_0: number): void;
  setAudioTrack(_0: number): void;
  setSubtitleTrack(_0: number): void;
}

export type MainModule = WasmModule & typeof RuntimeExports & EmbindModule;
export default function MainModuleFactory (options?: unknown): Promise<MainModule>;

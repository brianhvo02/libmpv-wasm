cmake_minimum_required(VERSION 3.8)

project(libmpv-wasm)

add_definitions(-std=c++17)
set (CMAKE_CXX_STANDARD 17)

find_package(PkgConfig REQUIRED)
pkg_check_modules(MPV REQUIRED mpv)
pkg_check_modules(SDL3 REQUIRED sdl3)

include_directories (${MPV_INCLUDE_DIRS})
link_directories (${MPV_STATIC_LIBRARY_DIRS})
include_directories (${SDL3_INCLUDE_DIRS})
link_directories (${SDL3_STATIC_LIBRARY_DIRS})
add_executable(libmpv libmpv.cpp)
set(CMAKE_EXECUTABLE_SUFFIX ".js")
set_target_properties(libmpv PROPERTIES LINK_FLAGS "-pthread -lembind -lopenal -lopfs.js -sWASMFS \
-sMODULARIZE -sINITIAL_MEMORY=1GB -sPROXY_TO_PTHREAD -sOFFSCREENCANVAS_SUPPORT \
-sENVIRONMENT=web,worker -sEXPORTED_RUNTIME_METHODS=['PThread'] -sEXPORT_NAME='libmpvLoader' \
-sFULL_ES3 --preload-file ../shaders@/shaders")
set_target_properties(libmpv PROPERTIES COMPILE_FLAGS "-pthread -sMEMORY64")
add_definitions (${MPV_CFLAGS_OTHER})
target_link_libraries (libmpv ${MPV_LIBRARIES})
target_link_libraries (libmpv ${MPV_STATIC_LIBRARIES})
add_definitions (${SDL3_CFLAGS_OTHER})
target_link_libraries (libmpv ${SDL3_LIBRARIES})
target_link_libraries (libmpv ${SDL3_STATIC_LIBRARIES})
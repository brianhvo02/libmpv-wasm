cmake_minimum_required(VERSION 3.8)

project(libmpv)

add_definitions(-std=c++17)
set (CMAKE_CXX_STANDARD 17)

find_package(PkgConfig REQUIRED)
pkg_check_modules(MPV REQUIRED mpv)
pkg_check_modules(SDL3 REQUIRED sdl3)
pkg_check_modules(LIBBLURAY REQUIRED libbluray)

include_directories(
    include
    ${MPV_INCLUDE_DIRS}
    ${SDL3_INCLUDE_DIRS}
    ${LIBBLURAY_INCLUDE_DIRS}
)

link_directories(
    ${MPV_STATIC_LIBRARY_DIRS}
    ${SDL3_STATIC_LIBRARY_DIRS}
    ${LIBBLURAY_STATIC_LIBRARY_DIRS}
)

set(SOURCES src/libmpv/thumbnail.cpp src/libmpv/libbluray.cpp src/libmpv/igs_reader.cpp src/libmpv/base64.cpp)
set(HEADERS include/thumbnail.h include/libbluray.h include/igs_reader.h include/base64.h)
add_executable(libmpv src/libmpv/libmpv.cpp ${SOURCES} ${HEADERS})

set(CMAKE_EXECUTABLE_SUFFIX ".js")
set(CMAKE_VERBOSE_MAKEFILE ON)

set_target_properties(libmpv PROPERTIES LINK_FLAGS "-lembind -lopenal --preload-file ../shaders@/shaders --emit-tsd libmpv.d.ts \
-sUSE_PTHREADS -sPROXY_TO_PTHREAD -sPTHREAD_POOL_SIZE=20 -sWASMFS -sMODULARIZE -sINITIAL_MEMORY=2GB -sOFFSCREENCANVAS_SUPPORT \
-sFULL_ES3 -sWASM_BIGINT -sENVIRONMENT=web,worker -sEXPORTED_RUNTIME_METHODS=['PThread','HEAP8'] -sEXPORT_NAME='libmpvLoader'")
set_target_properties(libmpv PROPERTIES COMPILE_FLAGS "-sUSE_PTHREADS")

add_definitions(
    ${MPV_CFLAGS_OTHER}
    ${SDL3_CFLAGS_OTHER}
    ${LIBBLURAY_CFLAGS_OTHER}
)

target_link_libraries(libmpv
    ${MPV_LIBRARIES}
    ${MPV_STATIC_LIBRARIES}
    ${SDL3_LIBRARIES}
    ${SDL3_STATIC_LIBRARIES}
    ${LIBBLURAY_LIBRARIES}
    ${LIBBLURAY_STATIC_LIBRARIES}
)
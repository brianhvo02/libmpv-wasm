#include "thumbnail.h"

using namespace std;

static void logging(const char *fmt, ...);
static AVFrame* allocPicture(enum AVPixelFormat pix_fmt, int width, int height);
static AVFrame* avFrameConvertPixelFormat(AVFrame *src, AVPixelFormat dstFormat);
static int save_frame(string *path, AVFrame *frame);
static int decode_packet(string *path, AVPacket *pPacket, AVCodecContext *pCodecContext, AVFrame *pFrame);

void generate_thumbnail(string *path, int64_t offset_in_seconds) {
    logging("initializing all the containers, codecs and protocols.");
    AVFormatContext *pFormatContext = avformat_alloc_context();
    if (!pFormatContext) {
        logging("ERROR could not allocate memory for Format Context");
        return;
    }

    logging("opening the input file (%s) and loading format (container) header", path->c_str());
    if (avformat_open_input(&pFormatContext, path->c_str(), NULL, NULL) != 0) {
        logging("ERROR could not open the file");
        return;
    }

    logging("format %s, duration %lld us, bit_rate %lld", pFormatContext->iformat->name, pFormatContext->duration, pFormatContext->bit_rate);

    logging("finding stream info from format");
    if (avformat_find_stream_info(pFormatContext,  NULL) < 0) {
        logging("ERROR could not get the stream info");
        return;
    }
        
    const AVCodec *pCodec = NULL;
    AVCodecParameters *pCodecParameters =  NULL;
    int video_stream_index = -1;

    for (int i = 0; i < pFormatContext->nb_streams; i++) {
        AVCodecParameters *pLocalCodecParameters = pFormatContext->streams[i]->codecpar;
        logging("AVStream->time_base before open coded %d/%d", pFormatContext->streams[i]->time_base.num, pFormatContext->streams[i]->time_base.den);
        logging("AVStream->r_frame_rate before open coded %d/%d", pFormatContext->streams[i]->r_frame_rate.num, pFormatContext->streams[i]->r_frame_rate.den);
        logging("AVStream->start_time %" PRId64, pFormatContext->streams[i]->start_time);
        logging("AVStream->duration %" PRId64, pFormatContext->streams[i]->duration);

        logging("finding the proper decoder (CODEC)");

        const AVCodec *pLocalCodec = avcodec_find_decoder(pLocalCodecParameters->codec_id);

        if (pLocalCodec == NULL) {
            logging("ERROR unsupported codec!");
            continue;
        }

        if (pLocalCodecParameters->codec_type == AVMEDIA_TYPE_VIDEO) {
            if (video_stream_index == -1) {
                video_stream_index = i;
                pCodec = pLocalCodec;
                pCodecParameters = pLocalCodecParameters;
            }

            logging("Video Codec: resolution %d x %d", pLocalCodecParameters->width, pLocalCodecParameters->height);
        } else if (pLocalCodecParameters->codec_type == AVMEDIA_TYPE_AUDIO) {
            logging("Audio Codec: %d channels, sample rate %d", pLocalCodecParameters->ch_layout.nb_channels, pLocalCodecParameters->sample_rate);
        }

        logging("\tCodec %s ID %d bit_rate %lld", pLocalCodec->name, pLocalCodec->id, pLocalCodecParameters->bit_rate);
    }

    if (video_stream_index == -1) {
        logging("File does not contain a video stream!\n");
        return;
    }

    AVCodecContext *pCodecContext = avcodec_alloc_context3(pCodec);
    if (!pCodecContext) {
        logging("failed to allocated memory for AVCodecContext\n");
        return;
    }

    if (avcodec_parameters_to_context(pCodecContext, pCodecParameters) < 0) {
        logging("failed to copy codec params to codec context\n");
        return;
    }

    if (avcodec_open2(pCodecContext, pCodec, NULL) < 0) {
        logging("failed to open codec through avcodec_open2\n");
        return;
    }

    AVFrame *pFrame = av_frame_alloc();
    if (!pFrame) {
        logging("failed to allocate memory for AVFrame\n");
        return;
    }
    
    AVPacket *pPacket = av_packet_alloc();
    if (!pPacket) {
        logging("failed to allocate memory for AVPacket\n");
        return;
    }

    int response = 0;
    double elapsed;

    while (av_read_frame(pFormatContext, pPacket) >= 0) {
        if (pPacket->stream_index == video_stream_index) {
            elapsed = (double)(pPacket->pts - pFormatContext->streams[video_stream_index]->start_time) * pFormatContext->streams[video_stream_index]->time_base.num / pFormatContext->streams[video_stream_index]->time_base.den;
            printf("elapsed: %f\n", elapsed);
            logging("AVPacket->pts %" PRId64, pPacket->pts);
            if (elapsed > offset_in_seconds) {
                response = decode_packet(path, pPacket, pCodecContext, pFrame);
                if (response <= 0 && response != AVERROR(EAGAIN))
                    break;
            }
        }
        av_packet_unref(pPacket);
    }

    logging("releasing all the resources");

    avformat_close_input(&pFormatContext);
    av_packet_free(&pPacket);
    av_frame_free(&pFrame);
    avcodec_free_context(&pCodecContext);
}

static int decode_packet(string *path, AVPacket *pPacket, AVCodecContext *pCodecContext, AVFrame *pFrame) {
    int response = avcodec_send_packet(pCodecContext, pPacket);

    if (response < 0) {
        logging("Error while sending a packet to the decoder: %s", av_err2str(response));
        return response;
    }

    while (response >= 0) {
        response = avcodec_receive_frame(pCodecContext, pFrame);
        if (response == AVERROR_EOF) {
            break;
        } else if (response < 0) {
            if (response != AVERROR(EAGAIN))
                logging("Error while receiving a frame from the decoder: %s", av_err2str(response));
            return response;
        }

        pFrame = avFrameConvertPixelFormat(pFrame, AV_PIX_FMT_RGB24);

        if (response >= 0) {
            printf("Frame %lld\n", pCodecContext->frame_num);

            string frame_path = path->substr(0, path->find_last_of(".")) + ".png";
            save_frame(&frame_path, pFrame);
            break;
        }
    }

    return 0;
}

static int save_frame(string *path, AVFrame *frame) {
    logging("Creating PNG file -> %s", path->c_str());

    FILE *fp = fopen(path->c_str(), "wb");
    if (!fp) {
        logging("Failed to open file '%s'", path->c_str());
        return -1;
    }

    png_structp png_ptr = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
    if (!png_ptr) {
        logging("Failed to create PNG write struct");
        fclose(fp);
        return -1;
    }

    png_infop info_ptr = png_create_info_struct(png_ptr);
    if (!info_ptr) {
        logging("Failed to create PNG info struct");
        png_destroy_write_struct(&png_ptr, NULL);
        fclose(fp);
        return -1;
    }

    if (setjmp(png_jmpbuf(png_ptr))) {
        logging("Error writing PNG file");
        png_destroy_write_struct(&png_ptr, &info_ptr);
        fclose(fp);
        return -1;
    }

    png_init_io(png_ptr, fp);

    png_set_IHDR(png_ptr, info_ptr, frame->width, frame->height, 8, PNG_COLOR_TYPE_RGB,
                 PNG_INTERLACE_NONE, PNG_COMPRESSION_TYPE_BASE, PNG_FILTER_TYPE_BASE);

    png_bytep *row_pointers = (png_bytep *) malloc(sizeof(png_bytep) * frame->height);
    for (int y = 0; y < frame->height; y++) {
        row_pointers[y] = (png_bytep) (frame->data[0] + y * frame->linesize[0]);
    }

    png_set_rows(png_ptr, info_ptr, row_pointers);
    png_write_png(png_ptr, info_ptr, PNG_TRANSFORM_IDENTITY, NULL);

    free(row_pointers);
    png_destroy_write_struct(&png_ptr, &info_ptr);
    fclose(fp);

    return 0;
}

static AVFrame* allocPicture(enum AVPixelFormat pix_fmt, int width, int height) {
    AVFrame *frame = av_frame_alloc();

    if (frame == NULL) {
        fprintf(stderr, "avcodec_alloc_frame failed");
    }

    if (av_image_alloc(frame->data, frame->linesize, width, height, pix_fmt, 1) < 0) {
        fprintf(stderr, "av_image_alloc failed");
    }

    frame->width = width;
    frame->height = height;
    frame->format = pix_fmt;

    return frame;
}

static AVFrame* avFrameConvertPixelFormat(AVFrame *src, AVPixelFormat dstFormat) {
    int width = src->width;
    int height = src->height;

    AVFrame *dst = allocPicture(dstFormat, width, height);

    SwsContext *conversion = sws_getContext(
        width, height, (AVPixelFormat)src->format,
        width, height, dstFormat,
        SWS_FAST_BILINEAR, NULL, NULL, NULL
    );
    sws_scale(conversion, src->data, src->linesize, 0, height, dst->data, dst->linesize);
    sws_freeContext(conversion);

    dst->format = dstFormat;
    dst->width = src->width;
    dst->height = src->height;

    return dst;
}

static void logging(const char *fmt, ...) {
    va_list args;
    fprintf( stdout, "LOG: " );
    va_start( args, fmt );
    vfprintf( stdout, fmt, args );
    va_end( args );
    fprintf( stdout, "\n" );
}
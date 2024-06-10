#include "igs_reader.h"

static bluray_mobj_cmd_t get_button_command(uint8_t** segment_ptr) {
    bluray_mobj_cmd_t command {
        .insn = {
            .op_cnt = static_cast<uint8_t>(((*segment_ptr)[0] & 0xE0) >> 5),
            .grp = static_cast<uint8_t>(((*segment_ptr)[0] & 0x18) >> 3),
            .sub_grp = static_cast<uint8_t>((*segment_ptr)[0] & 0x07),
            .imm_op1 = static_cast<uint8_t>(((*segment_ptr)[1] & 0x80) >> 7),
            .imm_op2 = static_cast<uint8_t>(((*segment_ptr)[1] & 0x40) >> 6),
            .branch_opt = static_cast<uint8_t>(((*segment_ptr)[1] & 0x0F)),
            .cmp_opt = static_cast<uint8_t>(((*segment_ptr)[2] & 0x0F)),
            .set_opt = static_cast<uint8_t>(((*segment_ptr)[3] & 0x1F))
        },
        .dst = static_cast<uint32_t>(((*segment_ptr)[4] << 24) | ((*segment_ptr)[5] << 16) | ((*segment_ptr)[6] << 8) | (*segment_ptr)[7]),
        .src = static_cast<uint32_t>(((*segment_ptr)[8] << 24) | ((*segment_ptr)[9] << 16) | ((*segment_ptr)[10] << 8) | (*segment_ptr)[11])
    };

    (*segment_ptr) += 12;
    return command;
}

static button_t get_button(uint8_t** segment_ptr) {
    button_t button {
        .button_id = static_cast<uint16_t>(((*segment_ptr)[0] << 8) | (*segment_ptr)[1]),
        .v = static_cast<uint16_t>(((*segment_ptr)[2] << 8) | (*segment_ptr)[3]),
        .f = (*segment_ptr)[4],
        .auto_action = static_cast<uint8_t>((*segment_ptr)[4] & 0x80),
        .x = static_cast<uint16_t>(((*segment_ptr)[5] << 8) | (*segment_ptr)[6]),
        .y = static_cast<uint16_t>(((*segment_ptr)[7] << 8) | (*segment_ptr)[8]),
        .navigation = {
            .up = static_cast<uint16_t>(((*segment_ptr)[9] << 8) | (*segment_ptr)[10]),
            .down = static_cast<uint16_t>(((*segment_ptr)[11] << 8) | (*segment_ptr)[12]),
            .left = static_cast<uint16_t>(((*segment_ptr)[13] << 8) | (*segment_ptr)[14]),
            .right = static_cast<uint16_t>(((*segment_ptr)[15] << 8) | (*segment_ptr)[16])
        },
        .normal = {
            .start = static_cast<uint16_t>(((*segment_ptr)[17] << 8) | (*segment_ptr)[18]),
            .stop = static_cast<uint16_t>(((*segment_ptr)[19] << 8) | (*segment_ptr)[20])
        },
        .normal_flags = static_cast<uint16_t>(((*segment_ptr)[21] << 8) | (*segment_ptr)[22]),
        .selected = {
            .start = static_cast<uint16_t>(((*segment_ptr)[23] << 8) | (*segment_ptr)[24]),
            .stop = static_cast<uint16_t>(((*segment_ptr)[25] << 8) | (*segment_ptr)[26])
        },
        .selected_flags = static_cast<uint16_t>(((*segment_ptr)[27] << 8) | (*segment_ptr)[28]),
        .activated = {
            .start = static_cast<uint16_t>(((*segment_ptr)[29] << 8) | (*segment_ptr)[30]),
            .stop = static_cast<uint16_t>(((*segment_ptr)[31] << 8) | (*segment_ptr)[32])
        },
        .cmds_count = static_cast<uint16_t>(((*segment_ptr)[33] << 8) | (*segment_ptr)[34])
    };

    (*segment_ptr) += 35;

    for (int cmd_idx = 0; cmd_idx < button.cmds_count; cmd_idx++) {
        bluray_mobj_cmd_t command = get_button_command(segment_ptr);
        button.commands.push_back(command);
    }

    return button;
}

static bog_t get_bog(uint8_t** segment_ptr, map<string, button_t>* buttons) {
    bog_t bog {
        .def_button = static_cast<uint16_t>(((*segment_ptr)[0] << 8) | (*segment_ptr)[1]),
        .button_count = (*segment_ptr)[2]
    };

    (*segment_ptr) += 3;

    for (int button_idx = 0; button_idx < bog.button_count; button_idx++) {
        button_t button = get_button(segment_ptr);
        buttons->insert({ to_string(button.button_id), button });
        bog.button_ids.push_back(button.button_id);
    }

    return bog;
}

static window_t get_window(uint8_t** segment_ptr) {
    window_t window {
        .id = (*segment_ptr)[0],
        .x = static_cast<uint16_t>(((*segment_ptr)[1] << 8) | (*segment_ptr)[2]),
        .y = static_cast<uint16_t>(((*segment_ptr)[3] << 8) | (*segment_ptr)[4]),
        .width = static_cast<uint16_t>(((*segment_ptr)[5] << 8) | (*segment_ptr)[6]),
        .height = static_cast<uint16_t>(((*segment_ptr)[7] << 8) | (*segment_ptr)[8])
    };

    (*segment_ptr) += 9;

    return window;
}

static effect_object_t get_effect_object(uint8_t** segment_ptr, map<string, window_t> windows) {
    uint16_t id = ((*segment_ptr)[0] << 8) | (*segment_ptr)[1];
    uint16_t window_id = ((*segment_ptr)[2] << 8) | (*segment_ptr)[3];

    effect_object_t object {
        .id = id,
        .window = windows.at(to_string(window_id)),
        .x = static_cast<uint16_t>(((*segment_ptr)[4] << 8) | (*segment_ptr)[5]),
        .y = static_cast<uint16_t>(((*segment_ptr)[6] << 8) | (*segment_ptr)[7])
    };

    (*segment_ptr) += 8;
    return object;
}

static effect_t get_effect(uint8_t** segment_ptr, map<string, window_t> windows) {
    effect_t effect {
        .duration = static_cast<uint32_t>(((*segment_ptr)[0] << 16) | ((*segment_ptr)[1] << 8) | (*segment_ptr)[2]),
        .palette = (*segment_ptr)[3],
        .object_count = (*segment_ptr)[4]
    };

    (*segment_ptr) += 5;

    for (int object_idx = 0; object_idx < effect.object_count; object_idx++) {
        effect_object_t object = get_effect_object(segment_ptr, windows);
        effect.objects.push_back(object);
    }

    return effect;
}

static window_effect_t get_window_effect(uint8_t** segment_ptr) {
    window_effect_t window_effect;
    uint8_t window_count = (*segment_ptr)[0];
    (*segment_ptr) += 1;

    for (int window_idx = 0; window_idx < window_count; window_idx++) {
        window_t window = get_window(segment_ptr);
        window_effect.windows[to_string(window.id)] = window;
    }

    uint8_t effect_count = (*segment_ptr)[0];
    (*segment_ptr) += 1;

    for (int effect_idx = 0; effect_idx < effect_count; effect_idx++) {
        effect_t effect = get_effect(segment_ptr, window_effect.windows);
        window_effect.effects.push_back(effect);
    }

    return window_effect;
}

static page_t get_page(uint8_t** segment_ptr) {
    uint8_t id = (*segment_ptr)[0];
    uint64_t uo = static_cast<uint64_t>(((uint64_t)(*segment_ptr)[2] << 54) | ((uint64_t)(*segment_ptr)[3] << 48) 
        | ((uint64_t)(*segment_ptr)[4] << 40) | ((uint64_t)(*segment_ptr)[5] << 32) | ((*segment_ptr)[6] << 24) 
        | ((*segment_ptr)[7] << 16) | ((*segment_ptr)[8] << 8) | (*segment_ptr)[9]);
    (*segment_ptr) += 10;

    page_t page {
        .id = id,
        .uo = uo,
        .in_effects = get_window_effect(segment_ptr),
        .out_effects = get_window_effect(segment_ptr),
        .framerate_divider = (*segment_ptr)[0],
        .def_button = static_cast<uint16_t>(((*segment_ptr)[1] << 8) | (*segment_ptr)[2]),
        .def_activated = static_cast<uint16_t>(((*segment_ptr)[3] << 8) | (*segment_ptr)[4]),
        .palette = (*segment_ptr)[5],
        .bog_count = (*segment_ptr)[6]
    };

    (*segment_ptr) += 7;

    for (int bog_idx = 0; bog_idx < page.bog_count; bog_idx++) {
        bog_t bog = get_bog(segment_ptr, &page.buttons);
        page.bogs.push_back(bog);
    }

    return page;
}

static menu_t get_menu(uint8_t** segment_ptr) {
    (*segment_ptr) += 3;

    menu_t menu {
        .width = static_cast<uint16_t>(((*segment_ptr)[0] << 8) | (*segment_ptr)[1]),
        .height = static_cast<uint16_t>(((*segment_ptr)[2] << 8) | (*segment_ptr)[3])
    };
    (*segment_ptr) += ((*segment_ptr)[12] & 0x80) ? 13 : 23;

    menu.page_count = (*segment_ptr)[3];
    (*segment_ptr) += 4;
    
    for (int page_idx = 0; page_idx < menu.page_count; page_idx++) {
        page_t page = get_page(segment_ptr);
        menu.pages.push_back(page);
    }

    return menu;
}

static vector<color_t> get_palette_segment(vector<uint8_t> pes_packet, uint16_t height) {
    vector<color_t> palettes;
    double kr;
    double kg;
    double kb;

    if (height >= 600) {
        kr = 0.2126;
        kg = 0.7152;
        kb = 0.0722;
    } else {
        kr = 0.299;
        kg = 0.587;
        kb = 0.114;
    }

    double offset_y = 16;
    double scale_y = 255.0 / 219.0;
    double scale_uv = 255.0 / 112.0;

    for (int i = 0; i < pes_packet.size() / 5 - 1; i++) {
        uint8_t id = pes_packet[5 + i * 5];
        uint8_t y = pes_packet[5 + i * 5 + 1];
        uint8_t cr = pes_packet[5 + i * 5 + 2];
        uint8_t cb = pes_packet[5 + i * 5 + 3];
        uint8_t alpha = pes_packet[5 + i * 5 + 4];

        // int r = (int) (y + 1.40200 * (cr - 0x80));
        // int g = (int) (y - 0.34414 * (cb - 0x80) - 0.71414 * (cr - 0x80));
        // int b = (int) (y + 1.77200 * (cb - 0x80));

        double sy = scale_y * (y - offset_y);
        double scb = scale_uv * (cb - 128);
        double scr = scale_uv * (cr - 128);

        int r = sy                            + scr * (1 - kr);
        int g = sy - scb * (1 - kb) * kb / kg - scr * (1 - kr) * kr / kg;
        int b = sy + scb * (1 - kb);

        r = max(0, min(255, r));
        g = max(0, min(255, g));
        b = max(0, min(255, b));
        
        color_t palette {
            .id = id,
            .r = (uint8_t)r,
            .g = (uint8_t)g,
            .b = (uint8_t)b,
            .alpha = alpha
        };
        palettes.push_back(palette);
    }

    return palettes;
}

static picture_t get_picture_segment(uint16_t picture_id, vector<uint8_t> pes_packet) {
    size_t i = 4;
    vector<uint8_t> decoded_data;
    size_t pixels_decoded = 0;
        
    picture_t picture = {
        .id = picture_id,
        .width = static_cast<uint16_t>((pes_packet[0] << 8) | pes_packet[1]),
        .height = static_cast<uint16_t>((pes_packet[2] << 8) | pes_packet[3]),
    };

    while (i < pes_packet.size()) {
        uint8_t color = pes_packet[i];
        i++;

        uint16_t run = 1;

        if (color == 0x00) {
            uint8_t flags = pes_packet[i];
            i++;
            
            run = flags & 0x3f;
            if (flags & 0x40) {
                run = (run << 8) + pes_packet[i];
                i++;
            }

            if (flags & 0x80) {
                color = pes_packet[i];
                i++;
            } else {
                color = 0x00;
            }
        } 

        assert(run >= 0);
        if (run > 0) {
            for (int j = 0; j < run; j++)
                decoded_data.push_back(color);
            pixels_decoded += run;
        } else if (pixels_decoded % picture.width != 0) {
            printf("pixels_decoded: %lu, picture.width: %u\n", pixels_decoded, picture.width);
            printf("Incorrect number of pixels\n");
            abort();
        }
    }
    
    size_t expected_size = picture.width * picture.height;
    size_t actual_size = decoded_data.size();
    
    if (actual_size < expected_size) {
        printf("Not enough pixels decoded: %lu < %lu\n", actual_size, expected_size);
        abort();
    } else if (actual_size > expected_size) {
        printf("Expected %lu pixels, got %lu\n", actual_size, expected_size);
    }

    picture.data = decoded_data;

    return picture;
}

static void PngWriteCallback(png_structp png, png_bytep data, png_size_t length) {
    vector<uint8_t> *p = (vector<uint8_t>*)png_get_io_ptr(png);
    p->insert(p->end(), data, data + length);
}

string get_button_picture_base64(vector<color_t> palette, picture_t picture) {
    vector<uint8_t> buffer;

    png_structp png = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
    if (!png) abort();

    png_infop info = png_create_info_struct(png);
    if (!info) abort();
    
    if (setjmp(png_jmpbuf(png))) abort();
    
    png_set_IHDR(
        png,
        info,
        picture.width, picture.height,
        8,
        PNG_COLOR_TYPE_RGB_ALPHA,
        PNG_INTERLACE_NONE,
        PNG_COMPRESSION_TYPE_DEFAULT,
        PNG_FILTER_TYPE_DEFAULT
    );

    png_bytepp row_pointers = (png_bytepp)malloc(sizeof(png_bytep) * picture.height);
    for (int y = 0; y < picture.height; y++) {
        row_pointers[y] = (png_bytep)malloc(sizeof(png_bytep) * picture.width * 4);
        for (int x = 0; x < picture.width * 4; x += 4) {
            uint8_t index = picture.data[y * picture.width + (x / 4)];
            color_t color = palette[index];

            row_pointers[y][x] = color.r;
            row_pointers[y][x + 1] = color.g;
            row_pointers[y][x + 2] = color.b;
            row_pointers[y][x + 3] = color.alpha;
        }
    }

    png_set_rows(png, info, row_pointers);
    png_set_write_fn(png, &buffer, PngWriteCallback, NULL);
    png_write_png(png, info, PNG_TRANSFORM_IDENTITY, NULL);

    return base64_encode(buffer.data(), buffer.size());
}

igs_t extract_menu(char const *filename) {
    ifstream stream(filename, ios::binary);

    vector<uint8_t> packet(PACKET_SIZE - 1);
    int count = 0; 
    int skipped_bytes = 0;

    std::set<uint16_t> map_pids;
    std::set<uint16_t> elementary_pids;

    vector<uint8_t> pes_packet;
    uint8_t pes_packet_type;
    uint16_t pes_length;

    menu_t menu;
    vector<vector<color_t>> palettes;
    vector<picture_t> pictures;

    uint16_t picture_id;
    uint32_t rlen;
    vector<uint8_t> picture_buffer;

    while (stream) {
        count++;
        stream.read(reinterpret_cast<char *>(packet.data()), 4);
        for (int i = 0; i < MAX_PACKET_SIZE; i++) {
            stream.read(reinterpret_cast<char *>(packet.data()), 1);
            if (packet.data()[0] == SYNC_BYTE) {
                skipped_bytes = i;
                break;
            }
        }

        if (skipped_bytes == MAX_PACKET_SIZE - 1) {
            printf("Couldn't find sync byte in stream\n");
            abort();
        }

        if (skipped_bytes)
            printf("Skipped %d bytes\n", skipped_bytes);

        stream.read(reinterpret_cast<char *>(packet.data() + 1), PACKET_SIZE - 1);

        uint8_t *payload = packet.data();

        uint8_t payload_unit_start_indicator = (payload[1] & 0x40) >> 6;
        uint16_t pid = ((payload[1] & 0x1F) << 8) | payload[2];
        uint8_t adaptation_field_control = (payload[3] & 0x30) >> 4;

        if (pid == 0x1fff)
            continue;

        if (adaptation_field_control == 0b11)
            payload += payload[4] + 5;
        else if (adaptation_field_control == 0b01)
            payload += 4;
        else continue;

        int is_pmt = map_pids.find(pid) != map_pids.end();
        int is_elementary = elementary_pids.find(pid) != elementary_pids.end();

        if (is_elementary) {
            if (payload_unit_start_indicator) {
                if (pes_packet.size() > 0) {
                    assert(pes_packet.size() == pes_length);

                    switch (pes_packet_type) {
                        case BUTTON_SEGMENT: {
                            uint8_t *segment = pes_packet.data();
                            menu = get_menu(&segment);
                            break;
                        }
                        case PALETTE_SEGMENT: {
                            vector<color_t> palette = get_palette_segment(pes_packet, menu.height);
                            palettes.push_back(palette);
                            break;
                        }
                        case PICTURE_SEGMENT: {
                            uint16_t current_picture_id = static_cast<uint16_t>((pes_packet[3] << 8) | pes_packet[4]);
                            uint8_t is_continuation = !(pes_packet[6] & 0x80);
                            if (!is_continuation) {
                                rlen = ((uint32_t)pes_packet[7] << 16) | (pes_packet[8] << 8) | pes_packet[9];
                                picture_id = current_picture_id;
                            } else {
                                assert(current_picture_id == picture_id);
                            }

                            if ((!is_continuation && rlen == pes_packet.size() - 10) || is_continuation && rlen == picture_buffer.size() + pes_packet.size() - 7) {
                                picture_buffer.insert(picture_buffer.end(), pes_packet.begin() + (is_continuation ? 7 : 10), pes_packet.end());
                                picture_t picture = get_picture_segment(current_picture_id, picture_buffer);
                                pictures.push_back(picture);
                                picture_buffer.clear();
                            } else {
                                picture_buffer.insert(picture_buffer.end(), pes_packet.begin() + (is_continuation ? 7 : 10), pes_packet.end());
                            }
                            
                            break;
                        }
                        default:
                            break;
                    }
                }

                assert(payload[0] << 16 | payload[1] << 8 | payload[2] == 0x000001);
                
                pes_length = (((uint16_t)payload[4] << 8) | payload[5]) - 3 - payload[8];

                payload += 9 + payload[8];

                pes_packet_type = payload[0];
                pes_packet.clear();
            }
            
            pes_packet.insert(pes_packet.end(), payload, payload + (PACKET_SIZE - (payload - packet.data())));
            continue;
        }

        if (payload_unit_start_indicator)
            payload += 1;

        uint8_t section_syntax_indicator = (payload[1] & 0x80) >> 7;
        uint8_t private_bit = (payload[1] & 0x40) >> 6;
        uint16_t section_length = ((payload[1] & 0x03) << 8) | payload[2];

        if (private_bit) continue;
        payload += 3;

        if (section_syntax_indicator) {
            payload += 5;
            section_length -= 5;
        }

        if (pid == 0x0000) {
            while (section_length > 4) {
                map_pids.insert(((payload[2] & 0x1F) << 8) | payload[3]);

                payload += 4;
                section_length -= 4;
            }

            uint32_t crc = payload[0] << 24 | payload[1] << 16 | payload[2] << 8 | payload[3];
        } else if (is_pmt) {
            uint16_t program_info_length = ((payload[2] & 0x0F) << 8) | payload[3];

            payload += 4 + program_info_length;
            section_length -= 4 + program_info_length;

            while (section_length > 4) {
                uint16_t es_info_length = ((payload[3] & 0x0F) << 8) | payload[4];
                uint16_t elementary_pid = ((payload[1] & 0x1F) << 8) | payload[2];

                if (payload[0] == STREAM_TYPE_IGS)
                    elementary_pids.insert(elementary_pid);

                payload += 5 + es_info_length;
                section_length -= 5 + es_info_length;
            }

            uint32_t crc = payload[0] << 24 | payload[1] << 16 | payload[2] << 8 | payload[3];
        } else {
            printf("Unknown PID: %#06x\n", pid);
            abort();
        }
    }

    map<string, picture_extended_t> picture_data;
    picture_extended_t* decoded;
    
    for (auto page : menu.pages) {
        for (auto const& [button_id, button] : page.buttons) {
            uint16_t picture_ids[6] = { 
                button.normal.start, button.normal.stop, 
                button.selected.start, button.selected.stop, 
                button.activated.start, button.activated.stop 
            };

            for (auto picture_id : picture_ids) {
                if (picture_id == 0xFFFF) continue;

                if (picture_data.find(to_string(picture_id)) == picture_data.end()) {
                    picture_t picture = pictures.at(picture_id);
                    picture_data.insert({ to_string(picture_id), {
                        .id = picture.id,
                        .width = picture.width,
                        .height = picture.height
                    } });
                }
                decoded = &picture_data.at(to_string(picture_id));

                if (decoded->data.find(to_string(page.palette)) != decoded->data.end())
                    continue;

                string base64 = get_button_picture_base64(palettes.at(page.palette), pictures.at(picture_id));
                decoded->data.insert({ to_string(page.palette), base64 });
            }
        }
    }

    return igs_t {
        .menu = menu,
        .palettes = palettes,
        .pictures = picture_data
    };
}

/*
 * instruction groups
 */

const enum HDMV_INSN_GRP {
    INSN_GROUP_BRANCH = 0,
    INSN_GROUP_CMP    = 1,
    INSN_GROUP_SET    = 2,
}

/*
 * BRANCH group
 */

/* BRANCH sub-groups */
const enum HDMV_INSN_GRP_BRANCH {
    BRANCH_GOTO   = 0x00,
    BRANCH_JUMP   = 0x01,
    BRANCH_PLAY   = 0x02,
}

/* GOTO sub-group */
const enum HDMV_INSN_GOTO {
    INSN_NOP          = 0x00,
    INSN_GOTO         = 0x01,
    INSN_BREAK        = 0x02,
}

/* JUMP sub-group */

const enum HDMV_INSN_JUMP {
    INSN_JUMP_OBJECT  = 0x00,
    INSN_JUMP_TITLE   = 0x01,
    INSN_CALL_OBJECT  = 0x02,
    INSN_CALL_TITLE   = 0x03,
    INSN_RESUME       = 0x04,
}

/* PLAY sub-group */
const enum HDMV_INSN_PLAY {
    INSN_PLAY_PL      = 0x00,
    INSN_PLAY_PL_PI   = 0x01,
    INSN_PLAY_PL_PM   = 0x02,
    INSN_TERMINATE_PL = 0x03,
    INSN_LINK_PI      = 0x04,
    INSN_LINK_MK      = 0x05,
}

/*
 * COMPARE group
 */

const enum HDMV_INSN_CMP {
    INSN_BC = 0x01,
    INSN_EQ = 0x02,
    INSN_NE = 0x03,
    INSN_GE = 0x04,
    INSN_GT = 0x05,
    INSN_LE = 0x06,
    INSN_LT = 0x07,
}

/*
 * SET group
 */

/* SET sub-groups */
const enum HDMV_INSN_GRP_SET {
    SET_SET       = 0x00,
    SET_SETSYSTEM = 0x01,
}
/* SET sub-group */
const enum HDMV_INSN_SET {
    INSN_MOVE   = 0x01,
    INSN_SWAP   = 0x02,
    INSN_ADD    = 0x03,
    INSN_SUB    = 0x04,
    INSN_MUL    = 0x05,
    INSN_DIV    = 0x06,
    INSN_MOD    = 0x07,
    INSN_RND    = 0x08,
    INSN_AND    = 0x09,
    INSN_OR     = 0x0a,
    INSN_XOR    = 0x0b,
    INSN_BITSET = 0x0c,
    INSN_BITCLR = 0x0d,
    INSN_SHL    = 0x0e,
    INSN_SHR    = 0x0f,
}

/* SETSYSTEM sub-group */
const enum HDMV_INSN_SETSYSTEM {
    INSN_SET_STREAM      = 0x01,
    INSN_SET_NV_TIMER    = 0x02,
    INSN_SET_BUTTON_PAGE = 0x03,
    INSN_ENABLE_BUTTON   = 0x04,
    INSN_DISABLE_BUTTON  = 0x05,
    INSN_SET_SEC_STREAM  = 0x06,
    INSN_POPUP_OFF       = 0x07,
    INSN_STILL_ON        = 0x08,
    INSN_STILL_OFF       = 0x09,
    INSN_SET_OUTPUT_MODE = 0x0a,
    INSN_SET_STREAM_SS   = 0x0b,

    INSN_SETSYSTEM_0x10  = 0x10,
}
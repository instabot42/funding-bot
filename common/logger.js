const term = require('terminal-kit').createTerminal({ generic: 'xterm-256color' });

const None = 0;
const Info = 1;
const Debug = 2;

class Logger {
    constructor() {
        this.level = None;
    }

    /**
     * Just set the level
     * @param level
     */
    setLevel(level) {
        this.level = level;
    }

    /**
     * Show an error msg
     * @param msg
     */
    error(msg) {
        if (this.level > None) {
            term.brightRed(`${Logger.toMsg(msg)}\n`);
        }
    }

    /**
     * Log a response (typically shown dimmed)
     * @param msg
     */
    debug(msg) {
        if (this.level >= Debug) {
            term.gray(`${Logger.toMsg(msg)}\n`);
        }
    }

    /**
     * For info about something. same as notice()
     * @param msg
     */
    info(msg) {
        this.notice(msg);
    }

    /**
     * For progress updates on a command
     * @param msg
     */
    progress(msg) {
        this.msg(msg);
    }

    /**
     * For results of executing a command
     * @param msg
     */
    results(msg) {
        if (this.level > None) {
            term.brightYellow(`${Logger.toMsg(msg)}\n`);
        }
    }

    /**
     *
     * @param msg
     */
    notice(msg) {
        if (this.level > None) {
            term.cyan(`${Logger.toMsg(msg)}\n`);
        }
    }

    /**
     *
     * @param msg
     */
    bright(msg) {
        if (this.level > None) {
            term.brightWhite.bold(`${Logger.toMsg(msg)}\n`);
        }
    }

    /**
     * Logging
     * @param msg
     */
    log(msg) {
        if (this.level >= Info) {
            term.brightYellow(`${Logger.toMsg(msg)}\n`);
        }
    }

    /**
     * Log a response (typically shown dimmed)
     * @param msg
     */
    logResponse(msg) {
        if (this.level >= Info) {
            term.gray(`${Logger.toMsg(msg)}\n`);
        }
    }

    /**
     * Dim stuff
     * @param msg
     */
    dim(msg) {
        this.logResponse(msg);
    }

    /**
     * Show a message
     * @param msg
     */
    msg(msg) {
        if (this.level >= Info) {
            term.green(`${Logger.toMsg(msg)}\n`);
        }
    }

    /**
     * Convert a message to something we can display
     * @param msg
     * @returns {string}
     */
    static toMsg(msg) {
        return typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
    }
}


module.exports.None = None;
module.exports.Info = Info;
module.exports.Debug = Debug;
module.exports.logger = new Logger();


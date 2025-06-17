class Quiz {
    constructor(socket) {
        this.init(socket);
    }

    ASKEDID = 'askedQ';
    asked = JSON.parse(sessionStorage.getItem(this.ASKEDID)) || [];

    resetAsked() {
        this.asked = [];
        sessionStorage.removeItem(this.ASKEDID);
    }

    getQuestion(cb) {
        this.socket.emit('getQuizQuestion', {
            bank: 'k2questionbank1',
            excludeIds: this.asked
        }, (r) => {
            if (r) {
                this.asked.push(r._id);
                sessionStorage.setItem(this.ASKEDID, JSON.stringify(this.asked));
                if (cb) cb(r);
            } else {
                console.warn('No more questions available, quiz will reset');
                this.resetAsked();
                this.getQuestion(cb);
            }
        });
    }

    /**
     * Submits an answer for evaluation.
     * @param {string} questionId - The MongoDB _id of the question.
     * @param {number} selectedIndex - Index of the selected option.
     * @param {function} cb - Callback function receiving the result { correct: true/false }.
     */
    submitAnswer(questionId, selectedIndex, cb) {
        this.socket.emit('submitAnswer', {
            bank: 'k2questionbank1',
            questionId,
            selectedIndex
        }, (response) => {
            if (cb) cb(response);
        });
    }

    init(socket) {
        this.socket = socket;
    }
}

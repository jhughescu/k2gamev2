class Quiz {
    constructor(socket, { session, setupModalClose, completeEvent }) {
        this.init(socket);
        this.setupGameAPI({ session, setupModalClose, completeEvent });
    }
    questionBank = 'k2questionbank2';
    gameAPI;
    socket = null;
    ASKEDID = 'askedQ';
    asked = JSON.parse(sessionStorage.getItem(this.ASKEDID)) || [];
    questionRef = null;
    questionSet = null;
    resetAsked() {
        this.asked = [];
        sessionStorage.removeItem(this.ASKEDID);
    };
    appendFeedback(str) {
        const fb = $('#quizFeedback');
        fb.append(str);
    }
    setupInterface(q) {
        const self = this;
//        console.log('ol', window.clone(q).optionsAllowed);
        console.log(q);
        const optionsAllowed = q.optionsAllowed < 0 ? q.options.length : q.optionsAllowed;

        $('.bQuizAnswer').off('click').on('click', function () {
            if ($(this).hasClass('disabled')) {
                return;
            }
            if (optionsAllowed === 1) {
                $('.bQuizAnswer').removeClass('clicked');
                $(this).addClass('clicked');
            } else {
//                $(this).toggleClass('clicked');
                if ($('.bQuizAnswer.clicked').not(this).length < optionsAllowed) {
                    $(this).toggleClass('clicked');
                }
            }
            const a = window.justNumber($(this).attr('id'));
            let A = [];
            $('.bQuizAnswer').each((i, e) => {
                if ($(e).hasClass('clicked')) {
                    A.push(i);
                }
            });
            if (A.length > 0) {
                window.removeTemplate('modal_footer');
                window.renderTemplate('modal_footer', 'modal.footer.button', {display: 'Submit'}, () => {
                    const bb = $('.k2-modal-btn');
                    bb.off('click').on('click', () => {
                        self.submitAnswer(q._id, A, (res) => {
                            $('.bQuizAnswer').prop('disabled', true);
                            $('.bQuizAnswer').addClass('disabled');
                            if (res.correctAnswerIndexes.length === 0) {
                                // no correct answer condition
                                self.appendFeedback('Thank you for your response, you can now close this panel.')
                            } else {
                                // correct/incorrect condition
                                self.appendFeedback(res.correct ? '✅ Correct!' : '❌ Incorrect!');
                                if (!res.correct) {
                                    self.appendFeedback(`<p>The correct answer${res.correctAnswerIndexes.length > 1 ? 's are' : ' is'} now highlighted.</p>`);
                                    $('.bQuizAnswer').each((i, e) => {
                                        $(e).addClass(res.correctAnswerIndexes.includes(i) ? 'correct' : 'incorrect');
                                    });
                                }
                            }
                            window.removeTemplate('modal_footer');
                            setTimeout(() => {
                                self.gameAPI.setupModalClose($('#overlay_modal'), true);
                            }, 500);
                            self.gameAPI.completeEvent();
                        });
                    });
                });
            } else {
                window.removeTemplate('modal_footer');
            }
        });
    }


    buildQuestionSet() {
        this.questionSet = Array.from({ length: this.questionRef.length }, (_, i) => i);
        this.questionSet = window.shuffle(this.questionSet);
        this.questionSet = this.questionSet.map(e => e = {n: e, s: 0})
//        console.log(this.questionSet);
    }
    getQuestionRefs(cb) {
        this.socket.emit('getQuestionRefs', {
            bank: this.questionBank
        }, (r) => {
            if (r) {
                this.questionRef = r;
//                console.log(this.questionRef);
                this.buildQuestionSet();
                if (cb) cb(r);
            } else {
                console.warn('No questions found!');
            }
        });
    }
    getQuestion(qId = 0, cb) {
//        console.log(this.questionBank);
        this.socket.emit('getQuizQuestion', {
            bank: this.questionBank,
            qId: qId,
//            excludeIds: this.asked
        }, (r) => {
            if (r) {
                this.asked.push(r._id);
                sessionStorage.setItem(this.ASKEDID, JSON.stringify(this.asked));
                if (cb) cb(r);
            } else {
                console.warn('No more questions available, quiz will reset');
                this.resetAsked();
                setTimeout(() => {
                    this.getQuestion(cb);
                }, 2000)
            }
        });
    }

    submitAnswer(questionId, selectedIndexes, cb) {
        const o = {
            sessionID: this.gameAPI.session.uniqueID,
            bank: this.questionBank,
            questionId,
            selectedIndexes
        }
//        console.log(o);
        this.socket.emit('submitAnswer', o, (response) => {
            if (cb) cb(response);
        });
    }
    setupGameAPI({ session, setupModalClose, completeEvent }) {
        this.gameAPI = { session, setupModalClose, completeEvent };
//        console.log(this.gameAPI);
    }
    init(socket) {
        this.socket = socket;
        this.getQuestionRefs();
    }
}

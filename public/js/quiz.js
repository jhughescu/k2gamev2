class Quiz {
    constructor(socket, { session, setupModalClose, completeEvent, getCheatState, gameData }) {
        this.init(socket);
        this.setupGameAPI({ session, setupModalClose, completeEvent, getCheatState, gameData });
        // console.log('Quiz initialized with session:', session, gameData);
    }
    questionBank = 'k2questionbank2';
    // console.log('define the question bank here', questionBank);
    // console.log(socket);
    gameAPI;
    socket = null;
    ASKEDID = 'askedQ';
    asked = JSON.parse(sessionStorage.getItem(this.ASKEDID)) || [];
    questionRef = null;
    questionSet = null;
    currentQuestion = null;
    resetAsked() {
        this.asked = [];
        sessionStorage.removeItem(this.ASKEDID);
    };
    appendFeedback(str) {
        const fb = $('#quizFeedback');
        fb.append(str);
    };
    getAllInputs() {
        const f = $('.quizQuestion');
        return f.find('input[type=checkbox], input[type=radio]');
    };
    getActiveInputs() {
        const f = $('.quizQuestion');
        return f.find('input[type=checkbox]:checked, input[type=radio]:checked');
    };
    handleInputChange(el) {
        const f = $('.quizQuestion');
        const ai = this.getActiveInputs();
        const hasActive = ai.length > 0;
        if (hasActive) {
            this.setupSubmit();
        } else {
            this.clearSubmit();
        }
    };
    setupInterface(q) {
        this.currentQuestion = q;
        const self = this;
        const optionsAllowed = q.optionsAllowed < 0 ? q.options.length : q.optionsAllowed;
        $('.quizQuestion').on('change', 'input[type=checkbox], input[type=radio]', function () {
            let OK = true;
            if (q.type === 'checkbox') {
                if (self.getActiveInputs().length === optionsAllowed + 1) {
                    OK = false;
                    this.checked = false;
                    return;
                }
            }

            if (OK) {
                self.handleInputChange($(this));
            }
        });
//        console.log(`interface set up, cheating? ${this.gameAPI.getCheatState()}`);
        if (this.gameAPI.getCheatState()) {
            setTimeout(() => {
                const ins = $('.quizQuestion').find('input');
                if (q.optionsAllowed === 1) {
                    ins[Math.floor(ins.length * Math.random())].click();
                } else {
                    const s = Math.floor(q.optionsAllowed * Math.random());
                    let a = Array.from({ length: ins.length }, (_, i) => i); // [0, 1, 2, ..., n-1]
                    for (let i = ins.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [a[i], a[j]] = [a[j], a[i]];
                    }
                    a = a.slice(0, Math.floor(ins.length * Math.random()) || 1);
                    ins.each((i, e) => {
                        if (a.includes(i)) {
                            e.click();
                        }
                    })

                }
                setTimeout(() => {
                    const bb = $('.k2-modal-btn');
                    bb.click();
                }, 1000);
            }, 1000);
        }
    };
    clearSubmit() {
        window.removeTemplate('modal_footer');
    };
    setupSubmit(q = {}) {
        if (this.currentQuestion) {
            q = this.currentQuestion;
        }
        const self = this;
        window.removeTemplate('modal_footer');
        window.renderTemplate('modal_footer', 'modal.footer.button', {display: 'Submit'}, () => {
            const bb = $('.k2-modal-btn');
            bb.off('click').on('click', () => {
                const all = self.getActiveInputs().map(function () {
                    return window.justNumber($(this).attr('id'));
                }).get();
                self.submitAnswer(self.currentQuestion._id, all, (res) => {
                    self.getAllInputs().prop('disabled', true);
                    if (res.correctAnswerIndexes.length === 0) {
                        // no correct answer condition
                        const fb = q.hasOwnProperty('feedback') ? q.feedback : 'Thank you for your response, you can now close this panel.';
                        self.appendFeedback(fb)
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
    };


    buildQuestionSet() {
        this.questionSet = Array.from({ length: this.questionRef.length }, (_, i) => i);
        this.questionSet = window.shuffle(this.questionSet);
        this.questionSet = this.questionSet.map(e => e = {n: e, s: 0})
//        console.log(this.questionSet);
    }
    getQuestionRefs(cb) {
        this.socket.emit('getQuestionRefs', {
            bank: this.getQuestionBank
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
//        console.log(this.getQuestionBank);
        this.socket.emit('getQuizQuestion', {
            bank: this.getQuestionBank(),
            qId: qId,
//            excludeIds: this.asked
        }, (r) => {
            if (r) {
//                console.log(r)
                this.asked.push(r._id);
                sessionStorage.setItem(this.ASKEDID, JSON.stringify(this.asked));
                if (cb) cb(r);
            } else {
                console.warn('No more questions available, quiz will reset');
                this.resetAsked();
                setTimeout(() => {
                    this.getQuestion(cb);
                }, 2000);
                if (cb) cb(false);
                return false;
            }
        });
    }

    submitAnswer(questionId, selectedIndexes, cb) {
        const o = {
            sessionID: this.gameAPI.session.uniqueID,
            bank: this.getQuestionBank(),
            questionId,
            selectedIndexes
        }
    //    console.log('Submitting answer:', o);
        // console.log(o);
        this.socket.emit('submitAnswer', o, (response) => {
            if (cb) cb(response);
        });
    }
    setupGameAPI({ session, setupModalClose, completeEvent, getCheatState, gameData }) {
        this.gameAPI = { session, setupModalClose, completeEvent, getCheatState, gameData };
//        console.log(this.gameAPI);
    }
    getGameAPI() {
        return this.gameAPI;
    }
    getQuestionBank() {
        let bank = this.questionBank;
        if (this.gameAPI && this.gameAPI.gameData && this.gameAPI.gameData.questionBank) {
            bank = this.gameAPI.gameData.questionBank;
        } 
        // console.log('returning question bank:', bank);
        return bank;
    }
    init(socket) {
        this.socket = socket;
        this.getQuestionRefs();
    }
}

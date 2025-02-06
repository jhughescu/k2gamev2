class Dice {
    constructor(elementId, onRollCallback) {
        this.element = document.getElementById(elementId);
        this.jElement = $(`#${elementId}`); // Get jQuery reference
        if (!this.element) return; // Prevent errors if element doesn't exist

        this.onRoll = onRollCallback || function(result) {};
        this.init();
    }

    init() {
        this.jElement.off('click').on('click', () => this.roll()); // Use jQuery event listener
    }

    roll() {
        const result = Math.floor(Math.random() * 6) + 1;
        this.onRoll(result);
        this.enable(false);
    }

    enable(boo) {
        if (boo) {
            this.jElement.removeClass('dead')
                .prop('disabled', false)
        } else {
            this.jElement.addClass('dead')
                .prop('disabled', true)
        }
    }
}

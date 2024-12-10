document.addEventListener('DOMContentLoaded', function () {
    const socket = io('', {
        query: {
            role: 'profilebuilder'
        }
    });
    let data = null;
    let profiles = null;

    const generateObjectFromForm = () => {
        const formData = {};
        const inputs = form.querySelectorAll('input, select');
        inputs.forEach(input => {
            const { name, type, value, checked } = input;
            if (type === 'radio') {
                // Only add the checked radio button
                if (checked) {
                    formData[name] = value;
                }
            } else if (type !== 'submit') {
                // For text inputs, select, and others
                formData[name] = value;
            }
        });

        return formData;
    };
    const checkForExisting = (name, country) => {
        let e = false;
        if (profiles.hasOwnProperty(country)) {
            if (profiles[country][name]) {
                e = true;
            }
        }
        return e;
    };
    const checkForm = () => {

        return true;

        let allValid = true;

        // Check text inputs and selects
        form.querySelectorAll('input[type="text"], select').forEach(input => {
            if (!input.value.trim()) {
                console.log(`${input.name || input.id} is empty`);
                allValid = false;
            }
        });

        // Check radio buttons
        const radioGroups = {};
        form.querySelectorAll('input[type="radio"]').forEach(radio => {
            if (!radioGroups[radio.name]) {
                radioGroups[radio.name] = false;
            }
            if (radio.checked) {
                radioGroups[radio.name] = true;
            }
        });

        // Verify each radio group has a checked option
        for (const [group, isValid] of Object.entries(radioGroups)) {
            if (!isValid) {
                console.log(`Radio group "${group}" has no selection`);
                allValid = false;
            }
        }

        return allValid;
    };
    const initForm = () => {
        renderTemplate('form', 'dev.profile.build.form', data, () => {
            const sub = $('.form-submit-btn');
            const n = $('#name');
            n.on('input', () => {
                console.log(n.val())
            });
            sub.off('click').on('click', function (ev) {
                ev.preventDefault();
                if (checkForm()) {
                    const res = generateObjectFromForm();
                    console.log(res);
                    console.log(res.name, res.country);
//                    if (res.name) {}
//                    socket.emit('writeProfile', res);
                } else {
                    alert('please complete all inputs');
                }
            });
        });
    };
    const showProfiles = () => {
//        console.log(profiles);
        const a = Object.entries(profiles);
        console.log(profiles)
        console.log(a)
        renderTemplate('profiles', 'dev.profile.build.profiles', a);
    };
    const getData = () => {
        socket.emit('getData', (s) => {
//            console.log('got data');
//            console.log(s);
            data = s;

        });
    };
    const getProfiles = () => {
        // fetch all the exisitng profiles & put them in an object
        const pPath = './data/profiles';
        socket.emit('getProfileFiles', pPath, (o) => {
            profiles = o;
        });
    };


    const init = () => {
//        console.log('init');
        getProfiles();
        getData();
        const i = setInterval(() => {
            if (data !== null & profiles  !== null) {
//                console.log(data);
//                console.log(profiles);
                initForm();
                showProfiles();
                clearInterval(i);
            }
        }, 200);
    };
    init();
});

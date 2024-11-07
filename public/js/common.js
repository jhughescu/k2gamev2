document.addEventListener('DOMContentLoaded', function () {
    let socket = null;
    let socketIdentifier = null;
    let player = null;
    let game = null;
    // templateStore maintains copies of each fetched template so they can be retrieved without querying the server
    const templateStore = {};
    const scoreMap = {
        0: 'round',
        1: 'src',
        2: 'dest',
        3: 'val',
        4: 'client'
    };

    // Define the setupObserver function to accept an element ID as an argument
    const setupObserver = (elementId, cb) => {
        // Select the target element based on the provided ID
        const targetNode = document.getElementById(elementId);

        // Ensure the targetNode exists before proceeding
        if (!targetNode) {
            console.error(`Element with ID '${elementId}' not found.`);
            return;
        }
        // Options for the observer (which mutations to observe)
        const config = {
            attributes: true,
            childList: true,
            subtree: true
        };
        // Callback function to execute when mutations are observed
        const callback = function (mutationsList, observer) {
            // Iterate over each mutation
            for (const mutation of mutationsList) {
                // Perform actions based on the type of mutation
                if (mutation.type === 'childList') {
                    //                    console.log('A child node has been added or removed');
                    // Perform actions such as updating the UI, etc.
                    if (cb) {
                        cb();
                    }
                } else if (mutation.type === 'attributes') {
                    //                    console.log('Attributes of the target element have changed');
                    // Perform actions such as updating the UI, etc.
                }
            }
        };
        // Create a new observer instance linked to the callback function
        const observer = new MutationObserver(callback);
        // Start observing the target node for configured mutations
        observer.observe(targetNode, config);
        // Later, you can disconnect the observer when it's no longer needed
        // observer.disconnect();
    };
    const checkDevMode = async () => {
        let dm = false;
//        console.log(`checkDevMode`);
        if (game.hasOwnProperty('isDev')) {
//            console.log(game);
            return game.isDev;
        } else {
            return new Promise((resolve, reject) => {
                socket.on('returnDevMode', (isDev) => {
                    console.log(`the resolver, isDev: ${isDev}`);
                    resolve(isDev);
                });
                socket.emit('checkDevMode');

                // Handle errors
                socket.on('error', (error) => {
                    // Reject the promise with the error message
                    console.warn(`checkDevMode error ${error}`)
                    reject(error);
                });
            });
        }
    }
    const procVal = (v) => {
        // process values into numbers, booleans etc
        const ipMatch = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (ipMatch.test(v)) {
            // do nothing if IP addresses
//            console.log('we have matched an IP', v);
        } else if (!isNaN(parseInt(v))) {
            v = parseInt(v);
        } else if (v === 'true') {
            v = true;
        } else if (v === 'false') {
            v = false;
        }
        return v;
    }
    const toCamelCase = (str) => {
        return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function(word, index) {
            return index !== 0 ? word.toLowerCase() : word.toUpperCase();
        }).replace(/\s+/g, '');
    };
    const justNumber = (i) => {
        if (i !== undefined && i !== null) {
//            console.log(`converting ${i}`);
            // returns just the numeric character(s) of a string/number
            const out = parseInt(i.toString().replace(/\D/g, ''));
            return out;
        } else {
            console.log(`no value passed to justNumber`)
        }
    };
    const roundNumber = (n, r) => {
        let m = 1;
        let rr = r === undefined ? 3 : r;
        for (let i = 0; i < rr; i++) {
            m *= 10;
        }
//        console.log(`m is ${m}`);
        return Math.round(n * m) / m;
    };
    const roundAll = (o) => {
        for (let i in o) {
//            console.log(o[i]);
            if (!isNaN(o[i])) {
                o[i] = roundNumber(o[i]);
            }
            if (typeof(o[i]) === 'object') {
                for (let j in o[i]) {
                    if (!isNaN(o[i][j])) {
                        o[i][j] = roundNumber(o[i][j]);
                    }
                }
            }
        }
        return o;
    };
    const emitWithPromise = (theSocket, event, data) => {
        return new Promise((resolve, reject) => {
            theSocket.emit(event, data, (response) => {
                resolve(response);
            });
        });
    };
    const loadCSS = (fileName) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = `css/${fileName}.css`; // Path to the CSS file
        document.head.appendChild(link);
    };
    const loadJS = (fileName) => {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = `js/${fileName}.js`;
        document.head.appendChild(script);
    };
    const isValidJSON = (j) => {
    //    console.log(j);
        try {
            JSON.parse(j);
            return true;
        } catch (e) {
            return false;
        }
    };

    const getTemplate = (temp, ob, cb) => {
        // returns a compiled template, but does not render it
        if (templateStore.hasOwnProperty(temp)) {
            // template exists in the store, return that
            const uncompiledTemplate = templateStore[temp];
            if (cb) {
                cb(uncompiledTemplate);
            }
        } else {
            // new template request, fetch from the server
            fetch(`/getTemplate?template=${temp}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(ob)
                })
                .then(response => response.text())
                .then(uncompiledTemplate => {
//                    const template = uncompiledTemplate;
                    templateStore[temp] = uncompiledTemplate;
                    if (cb) {
                        cb(uncompiledTemplate);
                    }
                })
                .catch(error => {
                    console.error('Error fetching or rendering template:', error);
                });
        }
    };
    const getPartials = () => {
        // Client-side code
//        console.log(`getPartials`);
        fetch('/partials')
            .then(response => response.json())
            .then(data => {
                const partials = data.partials;
//                console.log('partials');
//                console.log(partials);
                (async () => {
//                    console.log(`the async`)
                    for (const name in partials) {
                        const part = await Handlebars.compile(partials[name]);
                        Handlebars.registerPartial(name, part);
//                        console.log(part);
//                        console.log(`Handlebars.partials:`);
//                        console.log(JSON.parse(JSON.stringify(Handlebars.partials)));
                    }

                })();

                // Now the partials are registered and ready to use
            })
            .catch(error => {
                console.error('Error fetching partials:', error);
            });

    };

    const renderPartial = (targ, temp, ob, cb) => {
        if (ob === undefined) {
            console.error('Error: Data object is undefined');
            return;
        }
        if (targ.indexOf('#', 0) === 0) {
            targ = targ.replace('#', '');
        }
        console.log(`targ: ${targ}, temp: ${temp}`);
        $(`#${targ}`).css({opacity: 0});
        const part = Handlebars.partials[temp];
        console.log('renderPartial');
        console.log(part);
//        console.log(part(ob));
        if (document.getElementById(targ)) {
                document.getElementById(targ).innerHTML = part(ob);
            } else {
                console.warn(`target HTML not found: ${targ}`);
            }
            if (cb) {
                cb();
            }
            $(`#${targ}`).css({opacity: 1});
    };
    const removeTemplate = (targ, cb) => {
        $(targ).html('');
        if (cb) {
            cb();
        } else {
            console.warn('no callback provided for removeTemplate method');
        }
    };
    const renderTemplate = (targ, temp, ob, cb) => {
//        console.log(`renderTemplate`, targ, temp);
//        console.log(ob);
        if (ob === undefined) {
            console.error('Error: Data object is undefined');
            return;
        }
        if (targ.indexOf('#', 0) === 0) {
            targ = targ.replace('#', '');
        }
//        console.log(`targ: ${targ}`);
        $(`#${targ}`).css({opacity: 0});
        if (templateStore.hasOwnProperty(temp)) {
            // if this template has already been requested we can just serve it from the store
            const compiledTemplate = Handlebars.compile(templateStore[temp]);
            if (document.getElementById(targ)) {
                document.getElementById(targ).innerHTML = compiledTemplate(ob);
            } else {
//                console.warn(`target HTML not found: ${targ}`);
            }
            if (cb) {
                cb();
            }
            $(`#${targ}`).css({opacity: 1});
        } else {
            // If this template is being requested for the first time we will have to fetch it from the server
            fetch(`/getTemplate?template=${temp}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(ob)
                })
                .then(response => response.text())
                .then(uncompiledTemplate => {
                    const template = uncompiledTemplate;
                    templateStore[temp] = uncompiledTemplate;
                    const compiledTemplate = Handlebars.compile(template);
                    if (document.getElementById(targ)) {
                        document.getElementById(targ).innerHTML = compiledTemplate(ob);
                    } else {
//                        console.warn(`target HTML not found: ${targ}`);
                    }
                    if (cb) {
                        cb();
                    }

                    $(`#${targ}`).animate({opacity: 1});
                })
                .catch(error => {
                    console.error('Error fetching or rendering template:', error);
                });
        }
    };

//    console.log(`register it now!`);
    const getDyno = (name) => {
//        console.log(`getDyno: ${name}`);
        const partial = Handlebars.partials[name];
        if (typeof partial === 'function') {
            console.log('yep, is a funk');
            const rp = new Handlebars.SafeString(partial(this));
            console.log(rp);
            return rp;
        } else {
            console.log('is not a funk')
        }
        return '';
    }
    Handlebars.registerHelper('dynamicPartialNO', getDyno);
    Handlebars.registerHelper('dynamicPartial', function(partialName, options) {
        // Check if the partialName is defined and is a valid partial
        if (Handlebars.partials[partialName]) {
            // Include the specified partial
            return new Handlebars.SafeString(Handlebars.partials[partialName](this));
        } else {
            // Handle the case where the specified partial is not found
            return new Handlebars.SafeString('Partial not found');
        }
    });
    Handlebars.registerHelper('moreThan', function(a, b, options) {
        if (a > b) {
            return options.fn(this);
        } else {
            return options.inverse(this);
        }
    });
    Handlebars.registerHelper('notSameTeam', function(aID, bID, options) {
        if(justNumber(aID) !== justNumber(bID)) {
            return options.fn(this);
        }
    })

    const copyObjectWithExclusions = (obj, exclusions) => {
        const newObj = {};
        // Copy properties from the original object to the new object,
        // excluding properties specified in the exclusions array
        for (const key in obj) {
            if (!exclusions.includes(key)) {
                newObj[key] = obj[key];
            }
        }
        return newObj;
    };
    const createCopyLinks = () => {
        let uc = $('.copylink');
        uc.off('click').on('click', function() {
            copyToClipboard($(this).attr('id'));
        });
    };
    const copyToClipboard = (elementId) => {
        // Select the text inside the element
        const element = document.getElementById(elementId);
        const range = document.createRange();
        range.selectNode(element);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);

        // Copy the selected text to the clipboard
        document.execCommand('copy');
        alert('copied to clipboard');

        // Deselect the text
        window.getSelection().removeAllRanges();
    };
    const setupPanel = () => {
        console.log('setupPanel')
    };
    const getQueries = (u) => {
        // return an object all query string properties in a given URL
        let qu = {};
        if (u.indexOf('?', 0) > -1) {
            let r = u.split('?')[1];
//            console.log(r);
            // exclude any hash value
            r = r.replace(window.location.hash, '');
            r = r.split('&');
            r.forEach(q => {
                q = q.split('=');
                qu[q[0]] = q[1];
            });
        }
        return qu;
    };
    const filterScorePackets = (sp, prop, val) => {
        const spo = [];
        val = procVal(val);
        sp.forEach(s => {
//            console.log(`${prop} comparison - val: ${val}, s: ${s[prop]}`)
            if (s[prop] === val) {
                spo.push(s);
            }
        });
        return spo;
    };
    const unpackScore = (s) => {
        const sa = s.split('_');
        const o = {};
        sa.forEach((ss, i) => {
            o[scoreMap[i]] = justNumber(ss);
        });
        return o;
    };
    const thisRoundScoredV2 = (pl) => {
        const myPlayer = player === null ? pl : player;
        if (socket && myPlayer) {
            return new Promise((resolve, reject) => {
                socket.emit('getScores', `game-${game.uniqueID}`, (sps) => {
                    console.log(`getScores returns`, sps)
                    const scoreSumm = sps.map(s => `${s.round}.${s.src}`);
                    const rID = `${game.round}.${myPlayer.teamObj.id}`;
                    const spi = scoreSumm.indexOf(rID);
                    console.log(`scoreSumm`, scoreSumm);
                    console.log(`rID`, rID);
                    console.log(`spi`, spi);
                    const resOb = {hasScore: spi > -1, scorePacket: sps[spi], scorePackets: filterScorePackets(sps, 'round', game.round)};
                    console.log(`resOb`, resOb);
                    resolve(resOb);
                });
            })
        } else {
            console.log('no socket shared, cannot emit socket calls');
        }
    };
    const thisRoundScored = (pl) => {




        // NOTE adjust this method to allow for different behaviour between type 1 and 2 teams
        // i.e. type 1 has only 1 active player, so any score counts. With type 2 any player can score so only player-specifc scores should count.





        const myPlayer = player === null ? pl : player;
//        console.log(`judged player`, myPlayer);
        if (socket && myPlayer) {
            return new Promise((resolve, reject) => {
                socket.emit('getScorePackets', `game-${game.uniqueID}`, (sps) => {
                    if (myPlayer.teamObj) {
//                        const specificID = myPlayer.teamObj.type === 1 ? justNumber(myPlayer.id) : myPlayer.teamObj.id;
                        const specificID = myPlayer.teamObj.type === 1 ? myPlayer.teamObj.id : justNumber(myPlayer.id);
                        const specificProp = justNumber(myPlayer.teamObj.type) === 1 ? 'src' : 'client';
//                        console.log(`thisRoundScored ${myPlayer.teamObj.type}, ID: ${specificID}, prop: ${specificProp}`);
    //                    console.log(filterScorePackets(sps, specificProp, specificID));
                        const roundScores = filterScorePackets(sps, 'round', justNumber(game.round))
                        const myScores = filterScorePackets(roundScores, specificProp, specificID);

    //                    console.log(myScores.length);
//                        console.log(roundScores);
//                        console.log(myScores);
    //                    console.log(`new era, thisRoundScored? ${myScores.length > 0}`);
                        const scoreSumm = sps.map(s => `${s.round}.${s.src}`);
                        const rID = `${justNumber(game.round)}.${myPlayer.teamObj.id}`;
                        const spi = scoreSumm.indexOf(rID);

//                        console.log(`scoreSumm`, scoreSumm);
//                        console.log(`rID`, rID);

//                        console.log(`sps`, sps);
//                        console.log(`spi`, spi);
                        const resOb = {hasScore: spi > -1, scorePacket: sps[spi], scorePackets: filterScorePackets(sps, 'round', game.round)};
                        // NEW:
                        resOb.hasScore = myScores.length > 0;
    //                    console.log(resOb);
                        resolve(resOb);
                    }
                });
            })
        } else {
//            console.log('no socket shared, cannot emit socket calls');
        }
    };
    const sortNumber = (a, b) => {
        if (a > b) {
            return -1;
        } else if (a < b) {
            return 1;
        } else {
            return 0;
        }
    };
    const sortBy = (array, property, inv) => {
        return array.sort((a, b) => {
            if (a[property] < b[property]) {
                return inv ? 1 : -1;
            }
            if (a[property] > b[property]) {
                return inv ? -1 : 1;
            }
            return 0;
        });
    };
    const containsEmail = (s) => {
        const e = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        return e.test(s);
    };
    const mapSessionToGame = (s, g) => {
        const rg = Object.assign({}, g);
        for (let i in g) {
            if (g.hasOwnProperty(i)) {
                rg[i] = s[i];
//                console.log(`mapping ${i}: ${s[i]}`)
            }
        }
        return rg;
    };
    const reorderObject = (obj, firstKey) => {
        let reordered = { [firstKey]: obj[firstKey] };
        // Loop through the original object and add the rest of the properties
        for (let key in obj) {
            if (key !== firstKey) {
                reordered[key] = obj[key];
            }
        }
        return reordered;
    };
    // allocation/collaboration/vote controls can be used in facilitator dashboards, hence are defined in common.
    const getRemainingAllocation = (pl) => {
        const s = game.scores.map(sp => window.unpackScore(sp));
//        const t = pl.teamObj;
        const t = game.persistentData.teams[`t${pl.teamObj.id}`];
//        console.log(game.persistentData.teams);
//        console.log(pl.teamObj);
//        return;
        const ti = t.id;
        const tt = t.type;
        const r = window.justNumber(game.round);
        let ra = null;
//        console.log(t);
//        debugger;
        if (tt === 2) {
            // Assumption: PV team votes reset for each round
            ra = t.votes;
        } else {
            ra = t.votes;
            const ts = window.filterScorePackets(s, 'src', ti);
//            console.log(`getRemainingAllocation, current votes: ${t.votes}`, ts);
//            ra = 0;
            for (let i = 1; i < r; i++) {
                const rs = window.filterScorePackets(ts, 'round', i);
                if (rs.length > 0) {
                    ra -= window.filterScorePackets(ts, 'round', i)[0].val;
                }
            }
        }
//        console.log(`Team ${t.title} has ${ra} vote${ra > 1 ? 's' : ''} remaining`);
        return ra;
    };
    const setupAllocationControl = async (inOb) => {
//        console.log(`setupAllocationControl`);
        const myPlayer = player === null ? inOb : player;
        const butMinus = $('#vote_btn_minus');
        const butPlus = $('#vote_btn_plus');
        const val = $('.tempV');
        const submit = $(`#buttonAllocate`);
        const action = $(`#action-choice`);
        const desc = $(`#actionDesc`);
        const ints = $('#vote_btn_minus, #vote_btn_plus, #buttonAllocate, #action-choice, #actionDesc');
        const descMax = 150;
        const hasS = await thisRoundScored(myPlayer);
        let isDev = false;
//        console.log(game);
//        console.log(game.isDev);
        if (game.hasOwnProperty('isDev')) {
            isDev = game.isDev;
//            console.log('set')
        } else {
//            console.log('await');
            isDev = await checkDevMode();
        }
//        console.log(`setupAllocationControl, isDev? ${isDev}, isDev type: ${typeof(isDev)}`);
//        console.log(isDev);
        if (isDev) {
//            console.log('is dev')
        } else {
//            console.log('is not dev')
        }
        if (hasS) {
            if (hasS.hasScore) {
                const vOb = {gameID: `game-${game.uniqueID}`, team: myPlayer.teamObj.id};
                socket.emit('getValues', vOb, (v) => {
//                    console.log('got values', v);
                    ints.prop('disabled', true);
                    ints.addClass('disabled');
                    val.html(hasS.scorePacket.val);
                    desc.html(v.description);
                    action.val(v.action);
                    if (window.forceUpdate) {
                        forceUpdate();
                    }
                });
            } else {
                ints.off('click');
                butPlus.on('click', () => {
                    let v = parseInt(val.html());
                    if (v < 10) {
                        v += 1;
                        val.html(v);
                    }
                });
                butMinus.on('click', () => {
                    let v = parseInt(val.html());
                    if (v > 1) {
                        v -= 1;
                        val.html(v);
                    }
                });
                desc.on('input', function () {
                    const t = $(this).val();
                    if (containsEmail(t)) {
                        alert('Please do not include email addresses.')
                    }
                    if (t.length >= descMax) {
                        $(this).val(t.substr(0, descMax - 1));
                    }
                    const summ = `${t.length}/${descMax}`;
                    const label = $(this).parent().find('#moveDescLabel');
                    const base = label.html().replace(/[()/\d-]/g, ' ').replace(/\s+$/, '');
                    label.html(`${base}   (${summ})`);
                });
                let autofill = isDev;
                autofill = false;
                // Note - we need to detach autofill from isDev
                if (autofill) {
                    desc.html('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed lorem felis, lacinia non nibh at, maximus pretium mi. Proin imperdiet velit augue, quis laoreet neque iaculis vitae.');
                    val.html(1 + Math.ceil(Math.random() * 4));
                    const ch = action.find('option');
                    const range = ch.length;
                    const pick = 1 + Math.floor(Math.random() * (range - 1));
//                    console.log(range, pick)
                    action.prop('selectedIndex', pick);
                }
                submit.on('click', () => {
                    let scoreV = parseInt(val.html());
                    let actionV = action.val();
                    let descV = desc.val();
                    if (scoreV === 0 || actionV === '' || descV === '') {
                        alert('Please complete all options and allocate at least 1 resource')
                    } else {
                        const tID = myPlayer.teamObj.id;
                        let t = myPlayer.teamObj.id;
                        const vob = {game: game.uniqueID, values: {team: t, action: actionV, description: descV}};
                        socket.emit('submitValues', vob);
                        const sob = {scoreCode: {src: t, dest: t, val: scoreV}, game: game.uniqueID, client: myPlayer.id};
//                        console.log(`click the button, submit the score`);
                        socket.emit('submitScore', sob, (scores) => {
                            setupAllocationControl();
                        });
                    }
                });
            }
        } else {
//            console.log(`Whoops, no 'round scored' object found`);
        }
    };
    const setupVoteControl = async (inOb) => {
        const myPlayer = player === null ? inOb : player;
        const storeID = `votes-${game.address}-${myPlayer.id}-r${game.round}`;
        let store = [];
        let stored = [];
        if (localStorage.getItem(storeID)) {
            stored = localStorage.getItem(storeID).split(',');
        }
        const plIndex = procVal(myPlayer.index) - 1;
        const plID = justNumber(myPlayer.id);
        const hasS = await thisRoundScored(myPlayer);
        const cards = $('.resources-buttons');
        const butAdj = $('.resources-btn');
        const butMinus = $('.vote_btn_minus');
        const butPlus = $('.vote_btn_plus');
        const vAvailDisp = $('#vAvail');
        const vTotalDisp = $('#vTotal');
        const val = $('.value');
        const submit = $(`#buttonAllocate`);
        const ints = $('.vote_btn_minus, .vote_btn_plus, #buttonAllocate');
        const vTotal = myPlayer.teamObj.votes;
        const r = parseInt(game.round);
        const aOb = {gameID: `game-${game.uniqueID}`, round: procVal(game.round), src: myPlayer.teamObj.id};
        socket.emit('getAggregates', aOb, (a, sp, report) => {
            const myScores = filterScorePackets(filterScorePackets(sp, 'client', plID), 'round', game.round);
            const playerHasScored = Boolean(myScores.length);
            if (playerHasScored) {
//                console.log(myScores);
//                console.log(newMS);
            }
            let t = 0, tni = 0, tai = 0;
//            store = [];
            val.each((i, v) => {
                if (stored.length > 0) {
//                    $(v).html(stored[i])
                }
                const vv = parseInt($(v).html());
                tai += Math.abs(vv);
                tni += vv;
//                store.push(vv);

            });
            if (stored.length > 0) {
//                vAvailDisp.html(Math.abs(tai));
            }
            localStorage.setItem(storeID, store.join(','));
            let okAll = justNumber(vAvailDisp.html()) !== justNumber(vTotalDisp.html());
            if (playerHasScored) {
                butMinus.addClass('disabled');
                butPlus.addClass('disabled');
                submit.addClass('disabled');
                butMinus.prop('disabled', true);
                butPlus.prop('disabled', true);
                submit.prop('disabled', true);
                val.each((i, v) => {

                    $(v).html(myScores[i].val);
                    t += myScores[i].val;
                });
                vAvailDisp.html(Math.abs(t));
                return;
            } else {
                store = [];
                t = 0, tni = 0, tai = 0;
                val.each((i, v) => {
                    if (stored.length > 0) {
                        $(v).html(stored[i])
                    }
                    const vv = parseInt($(v).html());
                    tai += Math.abs(vv);
                    tni += vv;
                    store.push(vv);
                });
                if (stored.length > 0) {
                    vAvailDisp.html(Math.abs(tai));
                }
                localStorage.setItem(storeID, store.join(','));
                butAdj.off('click').on('click', function () {
                    val.each((i, v) => {
                        t += justNumber($(v).html());
                    });
                    let ta = 0;
                    let tn = 0;
                    // player.teamObj.votes must be the same for each player at setup
                    const adj = $(this).attr('id').indexOf('plus', 0) > -1 ? 1 : -1;
                    const avail = justNumber(vTotalDisp.html()) - justNumber(vAvailDisp.html());
                    t = 0;
                    val.each((i, v) => {
                        t += justNumber($(v).html());
                    });
                    t += adj;
                    const OK1 = justNumber(vTotalDisp.html()) > justNumber(vAvailDisp.html());
                    const OK2 = justNumber(vTotalDisp.html()) > justNumber(vAvailDisp.html()) + Math.abs(adj);
                    const OK3 = justNumber(vTotalDisp.html()) !== justNumber(vAvailDisp.html()) + Math.abs(adj);
                    const atMax = avail  === 0;
                    const h = $(this).parent().parent().parent().find('.value');
                    let v = parseInt(h.html());
                    const OK = OK1;
//                    if (!atMax || (atMax && adj < 0)) {
                        v += adj;
                        h.html(v);
//                    }
                    store = [];
                    val.each((i, v) => {
                        const myVal = parseInt($(v).html());
                        ta += Math.abs(myVal);
                        tn += myVal;
                    });
                    localStorage.setItem(storeID, store.join(','));
                    vAvailDisp.html(ta);
                    setupVoteControl(myPlayer);
                });
                let okPlus2 = tai !== justNumber(vTotalDisp.html());
                let okMinus2 = tni !== 0;
                okPlus2 = okMinus2 = true;

                if (okAll) {
                    butAdj.prop('disabled', false);
                } else {
                    butMinus.prop('disabled', true);
                    butPlus.prop('disabled', true);
                    cards.each((i, v) => {
                        const c = $(v);
                        const bPlus = c.find('.vote_btn_plus');
                        const bMinus = c.find('.vote_btn_minus');
                        const myVal = parseInt(c.find('.value').html());
                        if (myVal === 0) {
                            bMinus.prop('disabled', true);
                            bPlus.prop('disabled', true);
                        } else if (myVal < 0) {
                            bMinus.prop('disabled', true);
                            bPlus.prop('disabled', false);
                        } else {
                            bMinus.prop('disabled', false);
                            bPlus.prop('disabled', true);
                        }
                    });

                }
                submit.off('click').on('click', () => {
                    const sOb = {scoreCode: [], game: game.uniqueID, player: myPlayer.id};
                    val.each((i, v) => {
                        sOb.scoreCode.push({src: myPlayer.teamObj.id, dest: justNumber($(v).attr('id')), val: parseInt($(v).html()), client: justNumber(myPlayer.id)});

                    });
//                    console.log(`vote submitted`);
                    socket.emit('submitScoreForAverage', sOb);
                    localStorage.removeItem(storeID);
                    setupVoteControl(myPlayer);
                });
            }
        });

    };
    const setupCollaborationControl = async (inOb) => {
//        console.log('we set up collab control');
        const myPlayer = player === null ? inOb : player;
        const storeID = `collabs-${game.address}-${myPlayer.id}`;
        const ra = getRemainingAllocation(myPlayer);
        const vAvailDisp = $('#vAvail');
        const vTotalDisp = $('#vTotal');
        const butMinus = $('#vote_btn_minus');
        const butPlus = $('.vote_btn_plus');
        const butRes = $('.resources-btn');
        const allV = $('.value');
        const submit = $(`#buttonAllocate`);
        let store = [];
        let tva = 0;
        let stored = localStorage.getItem(storeID);
        let playerHasScored = false;



//        console.log('OK, we just need to add a condition which means the form does not remember results if we are in the FDB');
//        console.log(storeID, stored);



        socket.emit('getScorePackets', game.uniqueID, (s) => {
            const r = window.filterScorePackets(s, 'round', game.round);
            const team = window.filterScorePackets(r, 'src', myPlayer.teamObj.id);
            playerHasScored = team.length > 0;
            if (playerHasScored) {
                butRes.prop('disabled', true);
                submit.prop('disabled', true);
                return;
            } else {
                if (stored) {
                    stored = stored.split(',');
                }
                allV.each((v, e) => {
                    if (stored) {
                        $(e).html(stored[v]);
                    }
                    const val = Math.abs(parseInt($(e).html()));
                    tva += val;
                    store.push(val);
                });
                const ints = $('#vote_btn_minus, #vote_btn_plus, #buttonAllocate, #action-choice, #actionDesc');
                const hasS = false;
                const val = vTotalDisp;
                myPlayer.teamObj.votes = ra;
                vTotalDisp.html(ra);
                vAvailDisp.html(ra - (ra - tva));
                allV.each((v, e) => {
                    const myVal = parseInt($(e).html());
                        const okMinus = myVal === 0;
                        const okPlus = parseInt(vAvailDisp.html()) === parseInt(vTotalDisp.html());
//                        console.log(okMinus, okPlus);
                        $(e).closest('.resources-buttons').find('.vote_btn_minus').prop('disabled', okMinus);
                        $(e).closest('.resources-buttons').find('.vote_btn_plus').prop('disabled', okPlus);
                });
                if (hasS) {
        //            alert('all dunne')
                } else {
                    butRes.off('click').on('click', function () {
                        let v = parseInt(vTotalDisp.html());
                        const id = $(this).attr('id');
                        const disp = $(this).parent().find('.value');
                        const adj = $(this).attr('id').toLowerCase().includes('plus') ? 1 : -1;
                        if ((v - adj > -1) && (parseInt(disp.html()) + adj > -1)) {
                            disp.html(parseInt(disp.html()) + adj);
                            store = [];
                            allV.each((v, e) => {
                                const val = Math.abs(parseInt($(e).html()));
                                store.push(val);
                            });
                            localStorage.setItem(storeID, store.toString());
                            setupCollaborationControl(myPlayer);
                        }
                    });
                    submit.off('click').on('click', () => {
                        const src = myPlayer.teamObj.id;
//                        console.log('click')
                        allV.each((i, e) => {
                            const dest = justNumber($(e).attr('id'));
                            const v = parseInt($(e).html());
//                            console.log(v, $(e).html())
                            const scOb = {src: src, dest: dest, val: v, round: justNumber(game.round)};
                            const sob = {scoreCode: scOb, game: game.uniqueID, client: myPlayer.id};
//                            if (v > 0) {
                                socket.emit('submitScore', sob, (scores) => {
                                    setupCollaborationControl(myPlayer);
                                });
//                            }
                        });
                    });
                }
                localStorage.setItem(storeID, store.toString());
            }
        })

    };

    const createDynamicTeamData = () => {
        const rOb = {game: game};
        rOb.dynamicTeamData = [];
        rOb.game.persistentData.mainTeams.forEach((t, i) => {
            t.values = rOb.game.values.filter(tm => tm.team === t.id)[0];
            t.scores = rOb.game.detailedScorePackets.filter(sp => sp.src === t.id)[0];
            rOb.dynamicTeamData.push(t)
        });
        return rOb.dynamicTeamData;
    };
    const showDynamicTeamData = (dtd) => {
        console.log(`dynamicTeamData`, dtd)
    };
    window.showDynamicTeamData = showDynamicTeamData;
    window.createDynamicTeamData = createDynamicTeamData;


    // the 'share' methods are for sharing objects defined in other code files
    const socketShare = (sock, id) => {
        socket = sock;
        socketIdentifier = id;
//        console.log('share it out socket');

    };
    const getSocket = (id) => {
        if (id === socketIdentifier) {
            return socket;
        } else {
            return null;
        }
    };
    const playerShare = (pl) => {
        player = pl;
//        console.log('share it out; player');

    };
    const gameShare = (g) => {
        game = g;
//        console.log('share it out; game');

    };
    // NOTE: parials are currently set up each time the system admin connects, so the method call below is safe for now.
    // In case of problems getting partials, check the order of system architecture.
    getPartials();
    window.procVal = procVal;
    window.justNumber = justNumber;
    window.roundNumber = roundNumber;
    window.roundAll = roundAll;
    window.emitWithPromise = emitWithPromise;
    window.reorderObject = reorderObject;
    window.loadCSS = loadCSS;
    window.loadJS = loadJS;
    window.isValidJSON = isValidJSON;
    window.toCamelCase = toCamelCase;
    window.removeTemplate = removeTemplate;
    window.renderTemplate = renderTemplate;
    window.renderPartial = renderPartial;
    window.getTemplate = getTemplate;
    window.setupPanel = setupPanel;
    window.setupObserver = setupObserver;
    window.copyObjectWithExclusions = copyObjectWithExclusions;
    window.copyToClipboard = copyToClipboard;
    window.createCopyLinks = createCopyLinks;
    window.getQueries = getQueries;
    window.getPartials = getPartials;
    window.socketShare = socketShare;
    window.getSocket = getSocket;
    window.playerShare = playerShare;
    window.gameShare = gameShare;
    window.thisRoundScored = thisRoundScored;
    window.unpackScore = unpackScore;
    window.setupAllocationControl = setupAllocationControl;
    window.setupCollaborationControl = setupCollaborationControl;
    window.setupVoteControl = setupVoteControl;
    window.checkDevMode = checkDevMode;
    window.sortBy = sortBy;
    window.sortNumber = sortNumber;
    window.filterScorePackets = filterScorePackets;
    window.mapSessionToGame = mapSessionToGame;
});

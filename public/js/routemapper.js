document.addEventListener('DOMContentLoaded', function () {
    const socket = io('', {
        query: {
            role: 'mapper'
        }
    });
    const nodeCount = 30;
    const nodes = [];
    const springConstant = 5; // Scaling factor for force propagation

    const nodeZone = $('#zone');
    const b_reset = $('#reset');
    const b_output = $('#output');
    const b_test = $('#test');

    let output = null;

    const storeX = (id, x) => {
        localStorage.setItem(`map-node-${id}`, x);
    };
    const getStoredX = (id) => {
        return localStorage.getItem(`map-node-${id}`);
    };
    const calculateForce = (draggedNode, affectedNode) => {
        const distanceY = Math.abs(draggedNode.y - affectedNode.y);
        const distanceX = draggedNode.x - affectedNode.x; // Relative horizontal displacement
        const force = springConstant / (distanceY + 1); // Diminish with distance
        return distanceX > 0 ? force : -force; // Push or pull
    };
    const applyForces = (draggedNode) => {
        nodes.forEach((nodeObj) => {
            if (nodeObj.node[0].id !== draggedNode.node[0].id) {
                const force = calculateForce(draggedNode, nodeObj);
                nodeObj.x += force;
                nodeObj.node.css({ left: `${nodeObj.x}px` });
                storeX(nodeObj.node[0].id.split('_')[1], nodeObj.x);
            }
        });
    };
    const makeNodes = () => {
        for (let i = 0; i < nodeCount; i++) {
            nodeZone.append(`<div class='node' id='node_${i}'></div>`);
            const node = $(`#node_${i}`);
            const y = (nodeZone.height() / (nodeCount - 1)) * i;
//            console.log(y)
            const left = parseInt(getStoredX(i) || nodeZone.width() / 2, 10);
            nodes.push({
                node: node,
                x: left,
                y: y,
                xAdj: (left / (nodeZone.width() / 2)) - 1,
                yAdj: y / nodeZone.height() * 100
            });
            node.css({ left: `${left }px`, top: `${y - (node.height() / 2)}px` });
            storeX(i, left);
            node.draggable({
                axis: 'x',
                containment: nodeZone,
                drag: function () {
                    const id = $(this).attr('id').split('_')[1];
                    const draggedNode = nodes[id];
                    draggedNode.x = $(this).position().left;
                    storeX(id, draggedNode.x - ($('.node').width() / 2));
                    applyForces(draggedNode);
                },
                stop: function () {
                    generateOutput();
                    console.log($(this))
                }
            });
        }
        nodeZone.append(`<div class='node tester' id='node_test'></div>`);
        $('#node_test').css({
            top: `-${$('.node').height() / 2}px`,
            left: `${nodeZone.width() / 2}px`
        });
    };
    const resetNodes = () => {
        nodes.forEach((n, i) => {
            const x = nodeZone.width() / 2;
            storeX(i, x);
            n.x = x;
            n.node.css('left', x);
        });
        window.location.reload();
    };
    const setupZone = () => {
        nodeZone.css({
            position: 'absolute',
            top: '130px',
            left: '20px',
            width: '350px',
            height: '500px',
            'background-color': 'black'
        });
    };
    const generateOutput = () => {
        output = [];
        nodes.forEach((n, i) => {
            n.xAdj = (n.x / (nodeZone.width() / 2)) - 1;
            output.push({x: n.xAdj, y: n.yAdj});
        });
        // flip
        nodes.forEach((n, i) => {
            output[nodeCount - i - 1].y = n.yAdj;

        });
        output.reverse();
        socket.emit('writeMapFile', output);
    }
    const getX = (y) => {
        let comp = [];
        let rtn = null;
        if (y === 100) {
            rtn = output[0].x;
        } else {
            // get the ratio for y
            for (var i = 0; i < output.length; i++) {
                if (output[i + 1].y > y) {
                    comp = [output[i].y, output[i + 1].y];
                    const r = (y - comp[0]) / (comp[1] - comp[0]);
                    rtn = output[i].x + (r * (output[i + 1].x - output[i].x));
                    break;
                }
            }
        }
        return rtn;
    }
    const getXv1 = (y) => {
        let comp = [];
        let rtn = null;
//        console.log(y)
        if (y === 0) {
            rtn = output[output.length - 1].x
        } else {
//            for (var i = 0; i < output.length; i++) {
            for (var i = output.length - 1; i > 0; i--) {
//                console.log(output[i], y)
                if (output[i].y > y) {
                    comp = [output[i], output[i + 1]];
//                    console.log(comp);
                    break;
                }
            }


            if (comp[1] === undefined) {
                console.log('broke');
                console.log(comp);
//                return false;
                rtn = output[0].x;
            } else {
                const r = (y - comp[0].y) / (comp[1].y - comp[0].y);
                rtn = comp[0].x + ((comp[1].x - comp[0].x) * r);
            }

//            console.log(`y: ${y}, rtn: ${rtn}`);

        }
//        console.log(rtn);
        return rtn;
    }
    let testInt = null;
    const testOutput = () => {
        generateOutput();
        clearInterval(testInt);
        const nzw = nodeZone.width();
        const nzh = nodeZone.height();
        let i = 0;
        testInt = setInterval(() => {
            if (i < 100) {
                const posY = nzh - (i * (nzh / 100)) - ($('.node').height() / 2);
                const posX = (nzw / 2) + getX(i) * (nzw / 2);
                $('#node_test').css({
                    top: `${posY}px`,
                    left: `${posX}px`
                });
                i += 0.05;
            } else {
                clearInterval(testInt);
            }
        }, 10);
    }
    const testOutputV1 = () => {
        generateOutput();
        clearInterval(testInt);
        console.log(output);
        return;
        let i = 0;
        testInt = setInterval(() => {
            if (i < 100) {
                $('#node_test').css({
                    top: `${((100 - i) * (nodeZone.height() / 100)) - ($('.node').height() / 2)}px`,
                    left: `${(nodeZone.width() / 2) + (getX(i) * (nodeZone.width() / 2) - ($('.node').width() / 2))}px`
                });
                i += 0.5;
            }
        }, 10);
    }
    window.test = testOutput;

    b_reset.off('click').on('click', () => {
        resetNodes();
    });
    b_output.off('click').on('click', () => {
        generateOutput();
    });
    b_test.off('click').on('click', () => {
        testOutput();
    });

    const init = () => {
        setupZone();
        makeNodes();
    };

    init();
});

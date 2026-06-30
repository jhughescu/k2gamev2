const WINDOW_SECONDS = 120;
const LATENCY_WINDOW = 400;

const state = {
    buckets: new Map(),
    totalsByEvent: Object.create(null),
    latencyByEvent: Object.create(null)
};

const nowSec = () => Math.floor(Date.now() / 1000);

const ensureBucket = (sec) => {
    if (!state.buckets.has(sec)) {
        state.buckets.set(sec, {
            total: 0,
            byEvent: Object.create(null),
            byRole: Object.create(null)
        });
    }
    return state.buckets.get(sec);
};

const trimBuckets = (currentSec) => {
    const minSec = currentSec - WINDOW_SECONDS;
    for (const sec of state.buckets.keys()) {
        if (sec < minSec) {
            state.buckets.delete(sec);
        }
    }
};

const addLatency = (eventName, ms) => {
    if (!state.latencyByEvent[eventName]) {
        state.latencyByEvent[eventName] = [];
    }
    const arr = state.latencyByEvent[eventName];
    arr.push(ms);
    if (arr.length > LATENCY_WINDOW) {
        arr.shift();
    }
};

const percentile = (arr, p) => {
    if (!arr || arr.length === 0) {
        return 0;
    }
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length) - 1));
    return sorted[idx];
};

const sumWindow = (windowSec) => {
    const currentSec = nowSec();
    const startSec = currentSec - Math.max(1, windowSec) + 1;
    const summary = {
        total: 0,
        byEvent: Object.create(null),
        byRole: Object.create(null)
    };

    for (let sec = startSec; sec <= currentSec; sec += 1) {
        const bucket = state.buckets.get(sec);
        if (!bucket) {
            continue;
        }
        summary.total += bucket.total;
        Object.entries(bucket.byEvent).forEach(([eventName, count]) => {
            summary.byEvent[eventName] = (summary.byEvent[eventName] || 0) + count;
        });
        Object.entries(bucket.byRole).forEach(([role, count]) => {
            summary.byRole[role] = (summary.byRole[role] || 0) + count;
        });
    }

    return summary;
};

const getSocketRoleCounts = (io) => {
    const counts = {
        total: 0
    };
    if (!io || !io.of || !io.of('/')) {
        return counts;
    }

    io.of('/').sockets.forEach((connectedSocket) => {
        counts.total += 1;
        const role = ((connectedSocket.handshake && connectedSocket.handshake.query && connectedSocket.handshake.query.role) || 'unknown').toString();
        counts[role] = (counts[role] || 0) + 1;
    });
    return counts;
};

const monitorEvent = (eventName, role = 'unknown') => {
    const sec = nowSec();
    const bucket = ensureBucket(sec);

    bucket.total += 1;
    bucket.byEvent[eventName] = (bucket.byEvent[eventName] || 0) + 1;
    bucket.byRole[role] = (bucket.byRole[role] || 0) + 1;

    state.totalsByEvent[eventName] = (state.totalsByEvent[eventName] || 0) + 1;

    trimBuckets(sec);
};

const monitorLatency = (eventName, ms) => {
    if (typeof ms !== 'number' || Number.isNaN(ms)) {
        return;
    }
    addLatency(eventName, Math.max(0, Math.round(ms)));
};

const getSnapshot = ({ io, windowSec = 10 } = {}) => {
    const effectiveWindow = Math.max(1, Math.min(windowSec, WINDOW_SECONDS));
    const summary = sumWindow(effectiveWindow);

    const byEventRate = Object.entries(summary.byEvent)
        .map(([event, count]) => ({
            event,
            count,
            perSecond: Number((count / effectiveWindow).toFixed(2))
        }))
        .sort((a, b) => b.count - a.count);

    const latency = Object.entries(state.latencyByEvent).reduce((acc, [eventName, values]) => {
        const avg = values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
        acc[eventName] = {
            sampleSize: values.length,
            avgMs: avg,
            p95Ms: percentile(values, 95)
        };
        return acc;
    }, {});

    return {
        timestamp: Date.now(),
        windowSec: effectiveWindow,
        totals: {
            count: summary.total,
            perSecond: Number((summary.total / effectiveWindow).toFixed(2))
        },
        byEventRate,
        byRole: summary.byRole,
        totalsByEvent: state.totalsByEvent,
        latency,
        sockets: getSocketRoleCounts(io)
    };
};

module.exports = {
    monitorEvent,
    monitorLatency,
    getSnapshot
};

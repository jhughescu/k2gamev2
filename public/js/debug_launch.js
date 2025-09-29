(function () {
    const HOLD_DURATION = 4000; // ms
    let pressTimer = null;
    let debugActive = false;

    const isExcludedTarget = (el) => {
        if (!el) return false;
        // if text node, use its parent element
        if (el.nodeType === 3) el = el.parentElement;
        if (!el || typeof el.closest !== "function") return false;
        return !!el.closest("input, textarea, select, button, a, [contenteditable], [data-no-debug]");
    };
    const isInScrollbar = (e) => {
        const el = document.getElementById('theatre');
        let target = document.documentElement;

        if (el && el.scrollHeight > el.clientHeight) {
            target = el; // #theatre scrolls
        }

        const rect = target.getBoundingClientRect();
        const scrollbarWidth = target.offsetWidth - target.clientWidth;
        const scrollbarHeight = target.offsetHeight - target.clientHeight;

        // Classic scrollbars (space-consuming)
        const inClassicVertical = scrollbarWidth > 0 && e.clientX >= rect.right - scrollbarWidth;
        const inClassicHorizontal = scrollbarHeight > 0 && e.clientY >= rect.bottom - scrollbarHeight;

        // Overlay scrollbars (zero-width gutter)
        const inOverlayVertical = scrollbarWidth === 0 &&
            target.scrollHeight > target.clientHeight &&
            e.clientX >= rect.right;
        const inOverlayHorizontal = scrollbarHeight === 0 &&
            target.scrollWidth > target.clientWidth &&
            e.clientY >= rect.bottom;

        const inVertical = inClassicVertical || inOverlayVertical;
        const inHorizontal = inClassicHorizontal || inOverlayHorizontal;

        return inVertical || inHorizontal;
    };


    const startPress = (e) => {
        // allow multiple pointers but ignore if started in an excluded control
//        console.log(`startPress`);
        const tgt = e && e.target ? e.target : null;
        if (isExcludedTarget(tgt)) return;
        if (isInScrollbar(e)) return;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => askForPin(), HOLD_DURATION);
    };
    const endPress = () => {
        clearTimeout(pressTimer);
        pressTimer = null;
    };
    const showSessionID = () => {
        if (window.tools && typeof window.tools.showSessionID === "function") {
            window.tools.showSessionID();
        }
    };
    const hideSessionID = () => {
        if (window.tools && typeof window.tools.hideSessionID === "function") {
            window.tools.hideSessionID();
        }
    };
    const needPIN = () => {
        // return !(window.isLocal() || window.location.host.includes('ngrok-free.app'));
        return false;
    };
    const hapticShiver = (mode) => {
        if (!navigator.vibrate) return;
        if (mode === "on") navigator.vibrate([30, 40, 30]);
        else if (mode === "off") navigator.vibrate(60);
    };
    const askForPin = async () => {
        // if debug currently active -> turn off without asking PIN
        if (debugActive) {
            debugActive = false;
            flashBackground("off", () => {
                hapticShiver("off");
                if (window.eruda) window.eruda.destroy();
                hideSessionID();
            });
            return;
        }

        const entered = needPIN() ? prompt("Enter debug PIN:") : true;
        if (!entered) return;

        try {
            const res = await fetch("/api/check-debug-pin", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    pin: entered
                }),
            });

            const data = !needPIN() ? {
                ok: true
            } : await res.json();
            if (data.ok) {
                debugActive = true;
                flashBackground("on", () => {
                    hapticShiver("on");
                    if (!window.eruda) {
                        const script = document.createElement("script");
                        script.src = "https://cdn.jsdelivr.net/npm/eruda";
                        script.onload = () => {
                            if (window.eruda) {
                                window.eruda.init();
                                showSessionID();
                            }
                        };
                        document.body.appendChild(script);
                    } else {
                        // if already present, ensure it's initialized then show session
                        try {
                            window.eruda.init();
                        } catch (e) {}
                        showSessionID();
                    }
                });
            } else {
                alert("Incorrect PIN ❌");
            }
        } catch (err) {
            console.error("PIN verification failed", err);
        }
    };
    // camera-flash style: overlay is immediately visible (opacity:1) then fades out
    const flashBackground = (mode, callback) => {
        const duration = 200; // always 200ms
        const color = mode === "on" ? "#78e078" : "#dd6a6a";
        const overlay = document.createElement("div");

        Object.assign(overlay.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            backgroundColor: color,
            opacity: "1", // start fully visible (camera flash)
            transition: `opacity ${duration}ms ease`,
            zIndex: "9999999",
            pointerEvents: "none",
        });
        document.body.appendChild(overlay);

        // Force layout so the browser registers the initial state (important on mobile)
        // reading offsetHeight forces paint of the initial opacity:1 style
        void overlay.offsetHeight;

        // Start fade out on the next rendering frame
        requestAnimationFrame(() => {
            overlay.style.opacity = "0";
        });

        let called = false;

        const done = () => {
            if (called) return;
            called = true;
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (typeof callback === "function") callback();
        }

        // Listen for transitionend for opacity (fade-out completion)
        const onTransEnd = (e) => {
            if (e.propertyName !== "opacity") return;
            overlay.removeEventListener("transitionend", onTransEnd);
            done();
        }
        overlay.addEventListener("transitionend", onTransEnd);

        // Fallback: if transitionend doesn't fire, ensure cleanup after duration + small buffer
        setTimeout(() => {
            done();
            overlay.removeEventListener("transitionend", onTransEnd);
        }, duration + 80);
    };
    // Use pointer events if available to avoid duplicate touch/mouse events.
    if (window.PointerEvent) {
        document.addEventListener("pointerdown", startPress);
        document.addEventListener("pointerup", endPress);
        document.addEventListener("pointercancel", endPress);
    } else {
        // fallbacks for older browsers
        document.addEventListener("touchstart", startPress, {
            passive: true
        });
        document.addEventListener("touchend", endPress);
        document.addEventListener("mousedown", startPress);
        document.addEventListener("mouseup", endPress);
    }
})();

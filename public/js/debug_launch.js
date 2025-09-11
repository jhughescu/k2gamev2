(function () {
    const HOLD_DURATION = 5000; // ms
    let pressTimer = null;
    let debugActive = false; // 👈 track debug state

    function isExcludedTarget(el) {
        return (
            el.closest("input, textarea, select, button, a, [contenteditable], [data-no-debug]")
        );
    }

    function startPress(e) {
        if (isExcludedTarget(e.target)) return;
        pressTimer = setTimeout(() => askForPin(), HOLD_DURATION);
    }

    function endPress() {
        clearTimeout(pressTimer);
        pressTimer = null;
    }

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

    async function askForPin() {
        // 🔀 toggle logic
        if (debugActive) {
            // Turn OFF debug
            debugActive = false;
            flashBackground("off", 200, () => {
                if (window.eruda) {
                    window.eruda.destroy();
                }
                hideSessionID();
            });
            return;
        }

        // Turn ON debug
        const entered = needPIN() ? prompt("Enter debug PIN:") : true;
        if (!entered) return;

        try {
            const res = await fetch("/api/check-debug-pin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: entered }),
            });

            const data = !needPIN() ? { ok: true } : await res.json();
            if (data.ok) {
                debugActive = true;
                flashBackground("on", 200, () => {
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
                        window.eruda.init();
                        showSessionID();
                    }
                });
            } else {
                alert("Incorrect PIN ❌");
            }
        } catch (err) {
            console.error("PIN verification failed", err);
        }
    }

    function flashBackground(mode, duration, callback) {
        const $html = $("html");
        const hb = $html.css("background-color");

        // cancel any ongoing flash
        if ($html.data("flashActive")) {
            $html.off("transitionend.flash");
            $html.css("transition", "").css("background-color", hb);
            $html.removeData("flashActive");
        }

        $html.data("flashActive", true);

        // pick color based on mode
        const color = mode === "on" ? "#587c58" : "#804848";

        $html.css({
            "transition": `background-color ${duration}ms ease`
        });

        // Step 1: change to flash color
        $html.css({ "background-color": color });

        // Step 2: when transition ends (flash complete), revert
        $html.one("transitionend.flash", () => {
            $html.css({ "background-color": hb });

            // Step 3: wait for revert transition to finish
            $html.one("transitionend.flash", () => {
                $html.css("transition", ""); // cleanup
                $html.removeData("flashActive");
                if (typeof callback === "function") {
                    callback();
                }
            });
        });
    }

    // Desktop
    document.addEventListener("mousedown", startPress);
    document.addEventListener("mouseup", endPress);

    // Mobile
    document.addEventListener("touchstart", startPress);
    document.addEventListener("touchend", endPress);
})();

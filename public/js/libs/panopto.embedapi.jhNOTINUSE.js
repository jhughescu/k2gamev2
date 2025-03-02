"use strict";
var _a, _b, ApiError, PlayerState = {
    Ended: 0,
    Playing: 1,
    Paused: 2
};
! function (e) {
//    e.PlayNotAllowed = "playNotAllowed", e.PlayWithSoundNotAllowed = "playWithSoundNotAllowed", e.MediaPlayerError = "mediaPlayerError", e.Unknown = "unknown"
    e.PlayNotAllowed = "playNotAllowed", e.PlayWithSoundNotAllowed = "playWithSoundAllowed", e.MediaPlayerError = "mediaPlayerError", e.Unknown = "unknown"
}(ApiError || (ApiError = {}));
var LoginShownMessage = "iframeLoginShown",
    PanoptoSource = "PanoptoEmbed",
    EmbedApi = function () {
        function e(e, t) {
            var o, n, i, a, s, r;
            this.iframeContainer = document.getElementById(e), this.iframeId = e, this.height = t.height, this.width = t.width, this.sessionId = t.sessionId, this.serverName = t.serverName, this.isReady = !1, this.onStateChange = null === (o = t.events) || void 0 === o ? void 0 : o.onStateChange, this.onPlaybackRateChange = null === (n = t.events) || void 0 === n ? void 0 : n.onPlaybackRateChange, this.onError = null === (i = t.events) || void 0 === i ? void 0 : i.onError, this.onLoginShown = null === (a = t.events) || void 0 === a ? void 0 : a.onLoginShown, this.onReady = null === (s = t.events) || void 0 === s ? void 0 : s.onReady, this.onIframeReady = null === (r = t.events) || void 0 === r ? void 0 : r.onIframeReady, this.createIframe(t.videoParams)
        }
        return e.prototype.buildQueryString = function (e) {
            var t = "";
            if (e)
                for (var o = 0, n = Object.keys(e); o < n.length; o++) {
                    var i = n[o];
                    t += "&" + encodeURIComponent(i) + "=" + encodeURIComponent(e[i])
                }
            return t
        }, e.prototype.createIframe = function (e) {
            var t = this,
                o = "".concat(location.protocol, "//").concat(location.hostname);
            location.port && (o += ":".concat(location.port));
//            var n = "https://".concat(this.serverName, "/Panopto/Pages/Embed.aspx?id=") + "".concat(encodeURIComponent(this.sessionId)) + "&remoteEmbed=true&remoteHost=" + encodeURIComponent(o) + "&embedApiId=" + encodeURIComponent(this.iframeId) + this.buildQueryString(e);
            var n = "https://".concat(this.serverName, "/Panopto/Pages/Embed.aspx?id=") + "".concat(encodeURIComponent(this.sessionId)) + "&autoplay=false&remoteEmbed=true&remoteHost=" + encodeURIComponent(o) + "&embedApiId=" + encodeURIComponent(this.iframeId) + this.buildQueryString(e);
            this.iframe = document.createElement("iframe"), this.iframe.src = n, this.iframe.height = this.height, this.iframe.width = this.width, this.iframe.allow = "fullscreen", this.iframe.frameBorder = "0", this.iframeContainer.appendChild(this.iframe), window.addEventListener("message", (function (e) {
                var o, n, i, a, s, r;
                try {
                    var d = e.data,
                        u = JSON.parse(d);
                    if (u.source === PanoptoSource && (u.id === t.iframeId || "*" === u.id)) switch (u.msg) {
                        case "embedIframeReady":
                            null === (o = t.onIframeReady) || void 0 === o || o.call(t);
                            break;
                        case "iframeError":
                            null === (n = t.onError) || void 0 === n || n.call(t, u.data);
                            break;
                        case LoginShownMessage:
                            null === (i = t.onLoginShown) || void 0 === i || i.call(t);
                            break;
                        case "iframeState":
                            var p = u.data;
                            t.volume = p.volume, t.isVideoMuted = p.isMuted, t.currentTime = p.currentTime, t.duration = p.duration, t.speed = p.speed, t.isPaused = p.isPaused, t.isFinished = p.isFinished, t.captionLanguages = p.captionLanguages, t.selectedLanguage = p.selectedLanguage, t.areCaptionsDisplayed = p.areCaptionsEnabled, "iframeStateUpdate" === p.trigger ? (t.isReady || (null === (a = t.onReady) || void 0 === a || a.call(t), t.isReady = !0), null === (s = t.onStateChange) || void 0 === s || s.call(t, t.getState())) : "iframeSpeedUpdate" === p.trigger && (null === (r = t.onPlaybackRateChange) || void 0 === r || r.call(t))
                    }
                } catch (e) {}
            }), !1)
        }, e.prototype.getVideoUrl = function () {
            return "https://".concat(this.serverName, "/Panopto/Pages/Viewer.aspx?id=") + "".concat(encodeURIComponent(this.sessionId))
        }, e.prototype.getState = function () {
            return this.isFinished ? PlayerState.Ended : this.isPaused ? PlayerState.Paused : PlayerState.Playing
        }, e.prototype.playVideo = function () {
            this.sendMessage("iframePlay")
        }, e.prototype.pauseVideo = function () {
            this.sendMessage("iframePause")
        }, e.prototype.muteVideo = function () {
            this.sendMessage("iframeMute")
        }, e.prototype.unmuteVideo = function () {
            this.sendMessage("iframeUnmute")
        }, e.prototype.stopVideo = function () {
            this.sendMessage("iframeStop")
        }, e.prototype.getIsPaused = function () {
            return this.isPaused
        }, e.prototype.getVolume = function () {
            return this.volume
        }, e.prototype.isMuted = function () {
            return this.isVideoMuted
        }, e.prototype.getCurrentTime = function () {
            return this.currentTime
        }, e.prototype.getPlaybackRate = function () {
            return this.speed
        }, e.prototype.getDuration = function () {
            return this.duration
        }, e.prototype.seekTo = function (e) {
            this.sendMessage("iframeSeek", e)
        }, e.prototype.setPlaybackRate = function (e) {
            this.sendMessage("iframeSpeed", e)
        }, e.prototype.setVolume = function (e) {
            this.sendMessage("iframeVolume", e)
        }, e.prototype.loadVideo = function () {
            this.sendMessage("iframeLoad")
        }, e.prototype.enableCaptions = function (e) {
            this.sendMessage("iframeCaptionsOn", e)
        }, e.prototype.disableCaptions = function () {
            this.sendMessage("iframeCaptionsOff")
        }, e.prototype.getSelectedCaptionTrack = function () {
            return this.areCaptionsDisplayed ? this.selectedLanguage : -1
        }, e.prototype.hasCaptions = function () {
            return !!this.captionLanguages && this.captionLanguages.length > 0
        }, e.prototype.getCaptionTracks = function () {
            return this.captionLanguages
        }, e.prototype.sendMessage = function (e, t) {
            var o = null == t ? "" : t,
                n = {
                    msg: e,
                    source: PanoptoSource,
                    id: this.iframeId,
                    data: o
                };
//            console.log('API');
//            console.log(n);
//            console.log(JSON.stringify(n));
//            console.log("https://" + this.serverName);
            this.iframe.contentWindow.postMessage(JSON.stringify(n), "https://" + this.serverName)
        }, e
    }();
null === (_b = (_a = window).onPanoptoEmbedApiReady) || void 0 === _b || _b.call(_a);

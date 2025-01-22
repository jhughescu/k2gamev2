class VersionControl {
    constructor() {
        this.versionInfo = null;
        this.sessionID = null;
        this.storeID = `k2-dev-version`;
        this.initialize();
    }

    initialize() {
        this.checkVersion();
    }
    updateVersion(sessionID) {
        localStorage.setItem(this.storeID, this.versionInfo.timestamp);
//        debugger;
    }
    isCurrentVersion(sessionID) {
        const storedTimestamp = localStorage.getItem(this.storeID) || moment.utc(0).format();
        const timestampStored = moment(storedTimestamp);
        const timestampBuild = moment(this.versionInfo.timestamp);
//        console.log('compare');
//        console.log('stored', timestampStored);
//        console.log('from build', timestampBuild);
        return !timestampBuild.isAfter(timestampStored);
    }
    async checkVersion() {
        try {
            this.versionInfo = await this.loadVersionInfo();
            const storedTimestamp = localStorage.getItem(this.storeID) || moment.utc(0).format();
            const timestampStored = moment(storedTimestamp);
            const timestampBuild = moment(this.versionInfo.timestamp);
            if (timestampBuild.isAfter(timestampStored)) {

            } else {
//                console.log('current version');
            }
        } catch (err) {
            console.error('Failed to load version info:', err);
        }
    }
    loadVersionInfo() {
        return $.getJSON('data/build-info.json');
    }
}

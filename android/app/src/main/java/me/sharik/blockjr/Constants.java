package me.sharik.blockjr;

class Constants {

    // values have to be globally unique
    static final String INTENT_ACTION_DISCONNECT = "me.sharik.blockjr" + ".Disconnect";
    static final String NOTIFICATION_CHANNEL = "me.sharik.blockjr" + ".Channel";
    static final String INTENT_CLASS_MAIN_ACTIVITY = "me.sharik.blockjr" + ".MainActivity";

    // values have to be unique within each app
    static final int NOTIFY_MANAGER_START_FOREGROUND_SERVICE = 1001;

    private Constants() {}
}
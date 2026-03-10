package dk.kapetanovic.intent;

import android.content.Intent;
import android.net.Uri;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;

public class IntentPlugin extends CordovaPlugin {
    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        JSONObject options = args.getJSONObject(0);
        Intent intent = new Intent();

        if (options.has("action")) {
            intent.setAction(options.getString("action"));
        }
        if (options.has("categories")) {
            JSONArray categories = options.getJSONArray("categories");

            for (int i = 0; i < categories.length(); i++) {
                intent.addCategory(categories.getString(i));
            }
        }
        if (options.has("flags")) {
            JSONObject flags = options.getJSONObject("flags");
            int result = 0;

            for (Iterator<String> it = flags.keys(); it.hasNext();) {
                String key = it.next();
                int flag = fromStringFlag(key);
                result = result | flag;
            }

            intent.setFlags(result);
        }

        if (options.has("data")) {
            Uri uri = Uri.parse(options.getString("data"));

            if (options.has("type")) {
                intent.setDataAndType(uri, options.getString("type"));
            } else {
                intent.setData(uri);
            }
        } else if (options.has("type")) {
            intent.setType(options.getString("type"));
        }

        cordova.getActivity().startActivity(intent);
        callbackContext.success();
        return true;
    }

    private static int fromStringFlag(String flag) {
        if (flag.equals("ACTIVITY_BROUGHT_TO_FRONT")) return Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT;
        else if (flag.equals("ACTIVITY_CLEAR_TASK")) return Intent.FLAG_ACTIVITY_CLEAR_TASK;
        else if (flag.equals("ACTIVITY_CLEAR_TOP")) return Intent.FLAG_ACTIVITY_CLEAR_TOP;
        else if (flag.equals("ACTIVITY_EXCLUDE_FROM_RECENTS")) return Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS;
        else if (flag.equals("ACTIVITY_FORWARD_RESULT")) return Intent.FLAG_ACTIVITY_FORWARD_RESULT;
        else if (flag.equals("ACTIVITY_LAUNCHED_FROM_HISTORY")) return Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY;
        else if (flag.equals("ACTIVITY_LAUNCH_ADJACENT")) return Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT;
        else if (flag.equals("ACTIVITY_MULTIPLE_TASK")) return Intent.FLAG_ACTIVITY_MULTIPLE_TASK;
        else if (flag.equals("ACTIVITY_NEW_DOCUMENT")) return Intent.FLAG_ACTIVITY_NEW_DOCUMENT;
        else if (flag.equals("ACTIVITY_NEW_TASK")) return Intent.FLAG_ACTIVITY_NEW_TASK;
        else if (flag.equals("ACTIVITY_NO_ANIMATION")) return Intent.FLAG_ACTIVITY_NO_ANIMATION;
        else if (flag.equals("ACTIVITY_NO_HISTORY")) return Intent.FLAG_ACTIVITY_NO_HISTORY;
        else if (flag.equals("ACTIVITY_NO_USER_ACTION")) return Intent.FLAG_ACTIVITY_NO_USER_ACTION;
        else if (flag.equals("ACTIVITY_PREVIOUS_IS_TOP")) return Intent.FLAG_ACTIVITY_PREVIOUS_IS_TOP;
        else if (flag.equals("ACTIVITY_REORDER_TO_FRONT")) return Intent.FLAG_ACTIVITY_REORDER_TO_FRONT;
        else if (flag.equals("ACTIVITY_RESET_TASK_IF_NEEDED")) return Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED;
        else if (flag.equals("ACTIVITY_RETAIN_IN_RECENTS")) return Intent.FLAG_ACTIVITY_RETAIN_IN_RECENTS;
        else if (flag.equals("ACTIVITY_SINGLE_TOP")) return Intent.FLAG_ACTIVITY_SINGLE_TOP;
        else if (flag.equals("ACTIVITY_TASK_ON_HOME")) return Intent.FLAG_ACTIVITY_TASK_ON_HOME;
        else if (flag.equals("DEBUG_LOG_RESOLUTION")) return Intent.FLAG_DEBUG_LOG_RESOLUTION;
        else if (flag.equals("EXCLUDE_STOPPED_PACKAGES")) return Intent.FLAG_EXCLUDE_STOPPED_PACKAGES;
        else if (flag.equals("GRANT_PERSISTABLE_URI_PERMISSION")) return Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION;
        else if (flag.equals("GRANT_PREFIX_URI_PERMISSION")) return Intent.FLAG_GRANT_PREFIX_URI_PERMISSION;
        else if (flag.equals("GRANT_READ_URI_PERMISSION")) return Intent.FLAG_GRANT_READ_URI_PERMISSION;
        else if (flag.equals("GRANT_WRITE_URI_PERMISSION")) return Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        else if (flag.equals("INCLUDE_STOPPED_PACKAGES")) return Intent.FLAG_INCLUDE_STOPPED_PACKAGES;
        else if (flag.equals("RECEIVER_FOREGROUND")) return Intent.FLAG_RECEIVER_FOREGROUND;
        else if (flag.equals("RECEIVER_NO_ABORT")) return Intent.FLAG_RECEIVER_NO_ABORT;
        else if (flag.equals("RECEIVER_REGISTERED_ONLY")) return Intent.FLAG_RECEIVER_REGISTERED_ONLY;
        else if (flag.equals("RECEIVER_REPLACE_PENDING")) return Intent.FLAG_RECEIVER_REPLACE_PENDING;
        else throw new IllegalArgumentException("Unknown flag " + flag);
    }
}

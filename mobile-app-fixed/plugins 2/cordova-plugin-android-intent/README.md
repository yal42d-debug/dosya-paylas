# cordova-plugin-android-intent

Cordova plugin for sending Android intents.

    cordova plugin add cordova-plugin-android-intent

## Usage

Create and send an intent using the exposed constructor. Additional details can be found [here](https://developer.android.com/reference/android/content/Intent).

```javascript
cordova.plugins.Intent({
  action: 'android.intent.action.VIEW',
  data: 'file:///sdcard/Download/example.pdf',
  type: 'application/pdf',
  categories: [
    'android.intent.category.ALTERNATIVE'
  ],
  flags: {
    'ACTIVITY_NO_HISTORY': true
  }
}, function (err) {
  console.log('done')
})
```

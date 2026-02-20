#!/bin/bash
set -e

# Set Android Home
export ANDROID_HOME="/Users/yalcindegirmenci/Library/Android/sdk"
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/cmdline-tools/latest/bin

# Check Java
echo "Java Version:"
java -version
echo "JAVA_HOME: $JAVA_HOME"

# Check Android SDK
echo "Android Home: $ANDROID_HOME"
ls -l $ANDROID_HOME

# Install dependencies
echo "Installing dependencies..."
cd mobile-app
# npm install

# Build
echo "Building APK..."
# npx cordova platform remove android || true
# npx cordova platform add android@12 || true
npx cordova requirements android
npx cordova clean android
npx cordova build android --verbose

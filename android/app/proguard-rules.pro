# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# None of the native modules below publish their own consumer-rules.pro/proguard.txt
# (react-android's AAR does — its rules are pulled in automatically). Without these,
# R8 can rename/strip classes that are only looked up by name via JNI/JSI/reflection,
# which fails silently or crashes at runtime instead of at build time. Keep them intact.

# React Native core: native module / package / view-manager classes are instantiated
# via reflection by the bridge and Fabric's autolinking, so their names must survive.
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keep class * extends com.facebook.react.ReactPackage { *; }
-keepclassmembers class * {
    native <methods>;
}
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

# Nitro Modules (react-native-nitro-modules, react-native-nitro-image,
# react-native-vision-camera, react-native-vision-camera-barcode-scanner): HybridObjects
# are bound to JS via JNI method-name lookup, not normal Java call sites.
-keep class com.margelo.nitro.** { *; }
-keepclassmembers class com.margelo.nitro.** { *; }
-keep class com.mrousavy.camera.** { *; }

# react-native-keychain: talks to the Android Keystore / BiometricPrompt APIs, some of
# it through reflection.
-keep class com.oblador.keychain.** { *; }

# Gesture Handler / Screens: native ViewManagers looked up by class name from JS.
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# NetInfo / AsyncStorage
-keep class com.reactnativecommunity.netinfo.** { *; }
-keep class org.asyncstorage.** { *; }

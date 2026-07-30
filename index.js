import { AppRegistry } from 'react-native';
import App from './src/App';   // ← was './App'
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
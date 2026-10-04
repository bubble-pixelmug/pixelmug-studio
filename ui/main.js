import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { updateDocumentLanguage } from './i18n.js';

updateDocumentLanguage();

createApp(App).mount('#app');
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import App from './App.vue'
import { i18n } from './i18n'

import 'primevue/resources/themes/aura-light-blue/theme.css'
import 'primeicons/primeicons.css'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(PrimeVue, { ripple: true })
app.use(i18n)
app.mount('#app')

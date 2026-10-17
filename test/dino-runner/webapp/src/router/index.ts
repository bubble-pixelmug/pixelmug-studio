import { createRouter, createWebHashHistory } from 'vue-router';
import GameView from '../views/GameView.vue';
import LandingView from '../views/LandingView.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'landing', component: LandingView },
    { path: '/game', name: 'game', component: GameView },
  ],
});

export default router;


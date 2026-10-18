import { welcomeRoute } from './welcome.js';
import { loginEmailRoute, loginPhoneRoute } from './login.js';
import { registerRoute } from './register.js';
import { chatsRoute } from './chats.js';
import { newChatRoute } from './new-chat.js';
import { chatRoomRoute } from './chat-room.js';
import { profileRoute } from './profile.js';
import { blockedRoute } from './blocked.js';
import { searchRoute } from './search.js';
import { notificationsRoute } from './notifications.js';
import { settingsRoute } from './settings.js';
import { backupRoute } from './backup.js';
import { clearDataRoute } from './clear-data.js';

export const routes = [
  welcomeRoute, loginEmailRoute, loginPhoneRoute, registerRoute,
  chatsRoute, newChatRoute, chatRoomRoute,
  profileRoute, blockedRoute, searchRoute, notificationsRoute,
  settingsRoute, backupRoute, clearDataRoute,
];

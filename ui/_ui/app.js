// A minimal frontend for copyparty. Layout:
//   core/      no DOM wiring: API client, state + events, formatting, file kinds
//   ui/        generic widgets: toast, dialog, menu
//   views/     pure markup for each listing view
//   features/  one module per part of the app, each with an init function
import { initMenu } from "./ui/menu.js";
import { initTheme } from "./features/theme.js";
import { initAuth } from "./features/auth.js";
import { initNav, navigate } from "./features/nav.js";
import { initHeader } from "./features/header.js";
import { initSearch } from "./features/search.js";
import { initListing } from "./features/listing.js";
import { initActions } from "./features/actions.js";
import { initViewer } from "./features/viewer.js";
import { initUploads } from "./features/upload.js";
import { initKeyboard } from "./features/keyboard.js";

initMenu();
initTheme();
initAuth();
initNav();
initHeader();
initSearch();
initListing();
initActions();
initViewer();
initUploads();
initKeyboard();

navigate(location.pathname, false);

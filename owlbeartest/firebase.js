import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";

// These values identify the project and are public by design.
// Access is controlled by the database rules.
const firebaseConfig = {
  apiKey: "AIzaSyA1DkZmjDaC2ACPRGYfLoNhhqwHMGH6RMg",
  authDomain: "durfsheets.firebaseapp.com",
  databaseURL: "https://durfsheets-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "durfsheets",
  storageBucket: "durfsheets.firebasestorage.app",
  messagingSenderId: "598898464221",
  appId: "1:598898464221:web:2fdb3af2132fd47b969234",
};

export const db = getDatabase(initializeApp(firebaseConfig));
export { ref, onValue, get };

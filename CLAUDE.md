# Beckfield Bistro - Product Specification

## 1. Introduction
Beckfield Bistro is an AI-powered culinary companion designed to streamline the workflow of home cooks. The app digitizes physical recipes, organizes weekly meal plans, and intelligently generates shopping lists.

---

## 2. Brand & Visual Identity
- **Aesthetic**: Elegant, professional, and tranquil. Uses a palette of whites, soft slates, and amber accents.
- **Typography**: Uses the 'Inter' font family with a carefully tuned "rhythm"—tight line heights and balanced heading sizes optimized for mobile legibility.
- **Motion**: Subtle "animate-in" transitions for pages and a branded "fade in/out" splash screen during data synchronization.

---

## 3. User Journey & Onboarding
- **Splash Screen**: Upon opening, users see the Beckfield Bistro logo with a "Entering the Bistro..." loading message.
- **Authentication**: Secured by Google Sign-in.
- **Offline-First**: The app persists data locally. Subsequent launches are instant, showing cached data while auth and server updates happen in the background.

---

## 4. Recipe Management (The Library)
- **Library View**: A grid of recipe cards showing high-quality cover images, serving sizes, and total cooking times.
- **Search**: Real-time search by title, ingredients, or recipe source.
- **Source Tracking**: The app remembers where recipes come from (e.g., "NYT Cooking", "Family Notes") and suggests these sources when adding new recipes.
- **Quick Planning**: From the library view, recipes can be quickly added to the next empty day on the meal plan.
- **Detail View**:
    - **Tabbed Interface**: Focused views for "Ingredients" (clean list) and "Method" (numbered steps).
    - **Ingredient Scaling**: Users can adjust the serving size, and the app automatically recalculates ingredient quantities.
    - **Quick Planning**: One-tap ability to schedule the recipe for a specific date.

---

## 5. Recipe Capture (AI Digitization)
- **Capture Modes**:
    1. **Photo/Camera**: Users can snap a photo of a physical cookbook or handwritten note, crop the relevant area, and let AI extract structured data.
    2. **File Upload**: Upload existing images of recipes.
    3. **URL Import**: Paste a link from any major recipe website. AI extracts the title, ingredients, steps, and representative photography.
- **Review & Edit**: A robust form where users can refine the AI-extracted data, add a cover image (via camera, file, or URL), and select or add a new Source.
- **Note**: AI extraction (URL and photo modes) is currently stubbed with placeholder data. Integration with a real AI API (e.g. Claude Vision for photos, Claude for URL parsing) is the next step.

---

## 6. Meal Planning
- **Weekly Schedule**: A vertical timeline showing "This Week" and "Next Week".
- **Entry Types**:
    - **Recipe Meals**: Linked directly to the library.
    - **Custom Meals**: Manual text entries for quick planning.
    - **Dining Out**: Marked with a specific amber theme and location icons.
- **Planning Workflow**: Clicking "Plan Meal" opens a full-page search interface to find recipes or enter custom meal text.
- **Conversion**: Clicking a "Custom Meal" in the planner takes the user to the "New Recipe" screen with the title pre-filled, facilitating easy digitization.
- **Servings Management**: Adjust servings for specific days directly from the planner.
- **History**: A full-screen calendar view to browse past meal choices.

---

## 7. Shopping List
- **Generation**: Users select one or multiple entries from their meal plan to generate a list.
- **Intelligent Consolidation**: The app scales ingredients based on the planned servings and merges duplicates (e.g., combining 200g of flour from a cake and 300g from bread into a single "500g Flour" entry).
- **Dual Modes**:
    - **Edit Mode**: Add manual items, remove items, or reorder the list. (Drag-and-drop reordering is a planned enhancement — not yet implemented.)
    - **Shop Mode**: A focused mode for the supermarket. Large hit-areas for checking off items, with items sliding out of view as they are completed.
- **Auto-Sort**: One-tap organization that categorizes items by supermarket department (Produce, Bakery, Meat, etc.).
- **Persistence**: Undo/Redo support for accidental check-offs while shopping.

---

## 8. Navigation
- **Top Header**: Minimalist branding with a user profile menu for logging out.
- **Bottom Navigation**: Persistent floating bar providing instant access to "Recipes", "Plan", and "List".
- **Contextual Actions**: "Back" buttons are consistently placed at the bottom of sub-pages for ergonomic mobile use.

---

## 9. Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript 5.9 |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| State / persistence | Zustand v5 with `persist` middleware (localStorage) |
| Server state | TanStack React Query v5 |
| Routing | React Router v7 |
| Icons | Lucide React |
| PWA / offline | `vite-plugin-pwa` + Workbox (service worker, asset caching) |
| Deployment | Vercel (auto-deploys on push to `main`) |

---

## 10. PWA & Deployment

- **Live URL**: https://beckfield-bistro.vercel.app
- The app is a **Progressive Web App** — installable directly from the browser, no app store required.
- **iOS**: Open in Safari → Share → "Add to Home Screen"
- **Android**: Open in Chrome → "Install app" banner or three-dot menu → "Add to Home Screen"
- Once installed, the app launches in standalone mode (no browser chrome) with the amber theme colour in the status bar.
- Vercel auto-deploys every push to `main`. The service worker handles updates silently in the background.


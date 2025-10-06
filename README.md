# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/6a8b1507-b5c3-4213-9ae4-7a9d9899ff6f

## Nouveautés

- Lobby multijoueur permettant de créer ou rejoindre des salons en temps réel.
- Coach IA et générateur de règles pilotés par **Gemini 2.5 Flash** via l'intégration Lovable.
- [Nouveau] Procédure détaillée pour générer automatiquement des variantes d'échecs valides avec Codex (voir [docs/codex-variant-checklist.md](docs/codex-variant-checklist.md)).

### Configuration requise

Les Edge Functions utilisent désormais l'IA Lovable (Gemini 2.5). Sur Lovable, aucune configuration n'est nécessaire.

Pour un développement local, vous pouvez définir l'une des variables suivantes :

```
LOVABLE_GEMINI_API_KEY=<clef fournie par Lovable>
# ou, à défaut :
GEMINI_API_KEY=<votre clef API Gemini>
```

Ces clés sont utilisées par les fonctions `chess-coach` et `generate-custom-rules` pour produire les réponses IA.

Pour activer le moteur de règles IA côté interface, ajoutez également la variable suivante à votre fichier `.env` local :

```
VITE_LOVABLE_API_KEY=<clef fournie par Lovable>
```

Elle est requise par la nouvelle page "Moteur de Règles" accessible depuis l'accueil.

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/6a8b1507-b5c3-4213-9ae4-7a9d9899ff6f) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/6a8b1507-b5c3-4213-9ae4-7a9d9899ff6f) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

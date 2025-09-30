import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center animate-fade-in-up">
        <h1 className="mb-4 text-6xl font-bold gradient-chess bg-clip-text text-transparent">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Page non trouvée</p>
        <p className="mb-8 text-muted-foreground">Cette page d'échecs n'existe pas dans notre royaume.</p>
        <a href="/" className="inline-flex items-center px-6 py-3 text-primary hover:text-primary/80 transition-colors hover-lift">
          ← Retour à l'accueil
        </a>
      </div>
    </div>
  );
};

export default NotFound;

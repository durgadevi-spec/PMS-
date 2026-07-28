import { HardHat, Rocket, Timer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface UnderConstructionProps {
  title: string;
}

export default function UnderConstruction({ title }: UnderConstructionProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <Card className="max-w-md w-full border-none shadow-2xl bg-gradient-to-br from-background via-muted/50 to-background overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
          <HardHat size={120} />
        </div>
        
        <CardContent className="pt-12 pb-10 text-center relative z-10">
          <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-primary/10 text-primary mb-6 animate-pulse">
            <Rocket size={48} className="stroke-[1.5]" />
          </div>
          
          <h1 className="text-3xl font-bold tracking-tight mb-2">{title}</h1>
          <div className="flex items-center justify-center gap-2 text-primary font-medium mb-6">
            <Timer size={18} />
            <span>Coming Soon</span>
          </div>
          
          <p className="text-muted-foreground mb-8 leading-relaxed">
            We're currently building something amazing for you. 
            This module is under construction and will be available soon with full features.
          </p>
          
          <Button 
            className="w-full h-12 text-base font-semibold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => setLocation("/")}
          >
            Back to Dashboard
          </Button>
        </CardContent>
        
        <div className="h-1.5 w-full bg-muted overflow-hidden">
          <div className="h-full bg-primary w-1/3 animate-[loading_2s_ease-in-out_infinite]" 
               style={{
                 animation: 'loading 2s ease-in-out infinite'
               }}
          />
        </div>
      </Card>
      
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}

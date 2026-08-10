import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, User, Lock, Eye, EyeOff, ScanLine, Shield, ArrowLeft, Droplets, Milk } from "lucide-react";
import { useAuth } from "@/lib/auth";

const TEAM_CONFIG: Record<string, { name: string; color: string; icon: typeof Milk }> = {
  yaourt: { name: "Yaourt Team", color: "#1D6FB8", icon: Milk },
  eau: { name: "Eau Team", color: "#f30714", icon: Droplets },
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { team } = useParams<{ team: string }>();
  const teamKey = team?.toLowerCase() || "yaourt";
  const teamConfig = TEAM_CONFIG[teamKey] || TEAM_CONFIG.yaourt;
  const teamCode = teamKey === "yaourt" ? "YAOURT" : "EAU";

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await login({ login: loginId, password, teamCode });
      navigate(data.userType === "admin" ? "/admin" : "/commercial");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const Icon = teamConfig.icon;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel - branding with team color */}
      <div
        className="lg:w-1/2 text-white flex flex-col justify-center px-8 py-12 lg:px-16 lg:py-20 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${teamConfig.color}, ${teamConfig.color}CC 50%, ${teamConfig.color}99)` }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-10 right-10 w-72 h-72 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative z-10 max-w-md">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-8 text-sm"
          >
            <ArrowLeft size={16} />
            Retour au choix d'équipe
          </button>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <Icon size={26} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">COMTESSE</h1>
              <p className="text-white/70 text-sm">{teamConfig.name}</p>
            </div>
          </div>
          <h2 className="text-3xl lg:text-4xl font-bold leading-tight mb-4">
            Vérifiez la présence de vos commerciaux sur le terrain
          </h2>
          <p className="text-white/70 text-base leading-relaxed mb-8">
            Scannez un QR code, géolocalisez, confirmez. Une solution fiable et sécurisée pour garantir le passage de vos équipes sur les points de vente.
          </p>
          <div className="space-y-3">
            {[
              { icon: ScanLine, text: "Scan QR Code via caméra du téléphone" },
              { icon: MapPin, text: "Validation GPS à moins de 30 mètres" },
              { icon: Shield, text: "Données chiffrées et sécurisées" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-white/90">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center border border-white/10">
                  <item.icon size={18} />
                </div>
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="lg:w-1/2 flex items-center justify-center px-8 py-12 lg:px-16 bg-gray-50">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connexion</h2>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: teamConfig.color + "15", color: teamConfig.color }}>
              <Icon size={14} />
              {teamConfig.name}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Identifiant</label>
              <div className="relative">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="input pl-11"
                  placeholder="Votre identifiant ou email"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pl-11 pr-11"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 animate-fade-in">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full" style={{ backgroundColor: teamConfig.color, borderColor: teamConfig.color }}>
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

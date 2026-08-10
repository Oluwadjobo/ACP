import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets, Milk, ArrowRight, MapPin, Shield } from "lucide-react";
import { api } from "@/lib/api";
import type { Team } from "@/types";

const TEAM_ICONS: Record<string, typeof Milk> = {
  YAOURT: Milk,
  EAU: Droplets,
};

export function TeamSelectionPage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTeams()
      .then(setTeams)
      .catch(() => {
        // fallback to hardcoded teams if API fails
        setTeams([
          { id: "yaourt", code: "YAOURT", name: "Yaourt Team", color: "#1D6FB8", created_at: "" },
          { id: "eau", code: "EAU", name: "Eau Team", color: "#f30714", created_at: "" },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  const selectTeam = (team: Team) => {
    navigate(`/login/${team.code.toLowerCase()}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 px-4 py-12">
      <div className="mb-12 text-center animate-fade-in">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center shadow-lg">
            <MapPin size={28} className="text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">COMTESSE</h1>
            <p className="text-sm text-gray-500">Contrôle Terrain</p>
          </div>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Choisissez votre équipe</h2>
        <p className="text-gray-500 text-sm">Sélectionnez l'équipe à laquelle vous appartenez pour continuer.</p>
      </div>

      {loading ? (
        <div className="w-8 h-8 border-3 border-gray-200 border-t-primary-600 rounded-full animate-spin" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl w-full">
          {teams.map((team, index) => {
            const Icon = TEAM_ICONS[team.code] || Milk;
            const isHovered = hovered === team.code;
            return (
              <button
                key={team.id}
                onClick={() => selectTeam(team)}
                onMouseEnter={() => setHovered(team.code)}
                onMouseLeave={() => setHovered(null)}
                className="group relative overflow-hidden rounded-3xl bg-white shadow-lg hover:shadow-2xl transition-all duration-300 animate-scale-in border border-gray-100"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300"
                  style={{ backgroundColor: team.color }}
                />
                <div className="relative p-8 md:p-10 flex flex-col items-center text-center">
                  <div
                    className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      backgroundColor: team.color + "15",
                      border: `2px solid ${team.color}30`,
                    }}
                  >
                    <Icon size={36} style={{ color: team.color }} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{team.name}</h3>
                  <p className="text-sm text-gray-400 mb-6">COMTESSE {team.code === "YAOURT" ? "Yaourt" : "Eau"}</p>
                  <div
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 group-hover:gap-3 group-hover:shadow-lg"
                    style={{ backgroundColor: isHovered ? team.color : team.color + "DD" }}
                  >
                    Accéder à l'espace
                    <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={() => navigate("/login/superadmin")}
        className="mt-8 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
      >
        <Shield size={16} />
        Connexion Super Administrateur
      </button>
      <p className="mt-6 text-xs text-gray-400 text-center max-w-md">
        Vous ne pouvez accéder qu'aux données de votre équipe. Si vous n'êtes pas sûr de votre équipe, contactez votre administrateur.
      </p>
    </div>
  );
}

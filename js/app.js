function render(result, players, numCourts, numRounds, seedText) {
  elSchedule.innerHTML = "";
  elDiag.innerHTML = "";

  const { rounds, benches, stats } = result;

  // métadonnées
  const maxMatchesPossible = Math.floor(players.length / 4);
  const capCourts = Math.min(numCourts, maxMatchesPossible);
  elMeta.textContent = `${players.length} Joueurs · ${numCourts} Terrain(s) · ${numRounds} Tours`;

  // planning
  rounds.forEach((matches, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "round";

    const titleRow = document.createElement("div");
    titleRow.className = "roundTitle";
    
    const h3 = document.createElement("h3");
    h3.textContent = `Tour ${idx + 1}`;
    
    const bench = document.createElement("div");
    bench.className = "bench";
    bench.textContent = benches[idx].length ? `🪑 Banc: ${benches[idx].join(", ")}` : "🪑 Banc: Aucun";

    titleRow.appendChild(h3);
    titleRow.appendChild(bench);
    wrap.appendChild(titleRow);

    if (!matches.length) {
      const p = document.createElement("div");
      p.className = "subtle";
      p.style.marginTop = "8px";
      p.textContent = "Pas assez de joueurs pour un match ce tour-ci.";
      wrap.appendChild(p);
    } else {
      const matchesList = document.createElement("div");
      matchesList.className = "matches-list";

      matches.forEach((m, mIdx) => {
        const [t1, t2] = m;
        const matchCard = document.createElement("div");
        matchCard.className = "match-card";
        
        matchCard.innerHTML = `
          <span style="color: var(--text-subtle); font-size: 0.8rem; font-weight: bold;">T${mIdx+1}</span>
          <span class="team">${t1[0]} & ${t1[1]}</span>
          <span class="vs">VS</span>
          <span class="team">${t2[0]} & ${t2[1]}</span>
        `;
        matchesList.appendChild(matchCard);
      });
      wrap.appendChild(matchesList);
    }

    elSchedule.appendChild(wrap);
  });

  // diagnostics
  const plays = players.map(p => [p, stats.playsCount.get(p) ?? 0]);
  const benchesCount = players.map(p => [p, stats.benchCount.get(p) ?? 0]);

  const minPlays = Math.min(...plays.map(x => x[1]));
  const maxPlays = Math.max(...plays.map(x => x[1]));
  const minBen = Math.min(...benchesCount.map(x => x[1]));
  const maxBen = Math.max(...benchesCount.map(x => x[1]));

  const tmTop = topPairs(stats.teammateCount, 15).map(([k, v]) => `${k.replace("||", " & ")} (${v})`).join(", ");
  const opTop = topPairs(stats.opponentCount, 15).map(([k, v]) => `${k.replace("||", " vs ")} (${v})`).join(", ");

  const fairnessLine = players
    .slice()
    .sort((a, b) => a < b ? -1 : 1)
    .map(p => {
      const pl = stats.playsCount.get(p) ?? 0;
      const bn = stats.benchCount.get(p) ?? 0;
      return `<strong>${p}</strong> : ${pl}J / ${bn}B`;
    })
    .join(" · ");

  elDiag.innerHTML = `
    <p><strong>Équilibre Matchs :</strong> Min ${minPlays} - Max ${maxPlays} joués</p>
    <p><strong>Équilibre Banc :</strong> Min ${minBen} - Max ${maxBen} passages</p>

    <p><strong>Paires les plus fréquentes :</strong> ${tmTop || "Aucune"}</p>
    <p><strong>Oppositions les plus fréquentes :</strong> ${opTop || "Aucune"}</p>
    <p><strong>Ratio individuel (J=Joué, B=Banc) :</strong> ${fairnessLine}</p>
  `;

  // active la copie
  btnCopy.disabled = false;
  btnCopyLink.disabled = false;
}
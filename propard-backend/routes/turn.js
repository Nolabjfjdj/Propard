const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

// 10 récupérations de credentials TURN par minute et par utilisateur.
const turnRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyFn: (req) => req.user.id,
  message: 'Trop de demandes de connexion, merci de patienter.'
});

/*
 * Les serveurs TURN sont configurés avec :
 *
 * METERED_DOMAIN
 * METERED_SECRET_KEY
 *
 * puis :
 *
 * METERED1_DOMAIN
 * METERED1_SECRET_KEY
 *
 * METERED2_DOMAIN
 * METERED2_SECRET_KEY
 *
 * etc.
 *
 * On s'arrête dès qu'un numéro n'existe plus.
 */
function getMeteredServers() {
  const servers = [];

  // Serveur principal
  if (
    process.env.METERED_DOMAIN &&
    process.env.METERED_SECRET_KEY
  ) {
    servers.push({
      id: 'metered',
      domain: process.env.METERED_DOMAIN,
      apiKey: process.env.METERED_SECRET_KEY
    });
  }

  // Serveurs supplémentaires
  for (let i = 1; i <= 20; i++) {
    const domain = process.env[`METERED${i}_DOMAIN`];
    const apiKey = process.env[`METERED${i}_SECRET_KEY`];

    if (!domain || !apiKey) {
      continue;
    }

    servers.push({
      id: `metered${i}`,
      domain,
      apiKey
    });
  }

  return servers;
}

/*
 * Récupère les ICE servers d'un serveur Metered.
 *
 * IMPORTANT :
 * La clé utilisée ici doit être la credential/API key attendue
 * par /api/v1/turn/credentials.
 *
 * Si tes variables actuelles sont réellement des Secret Keys de
 * compte Metered et non des credential API keys, il faudra adapter
 * cette partie à tes credentials Metered existants.
 */
async function fetchMeteredIceServers(serverConfig) {
  const url =
    `https://${serverConfig.domain}` +
    `/api/v1/turn/credentials` +
    `?apiKey=${encodeURIComponent(serverConfig.apiKey)}`;

  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Metered server ${serverConfig.id} returned ${response.status}`
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Metered server ${serverConfig.id} returned invalid JSON`
    );
  }

  const iceServers =
    Array.isArray(data)
      ? data
      : data?.iceServers;

  if (!Array.isArray(iceServers)) {
    throw new Error(
      `Metered server ${serverConfig.id} returned invalid ICE servers`
    );
  }

  return iceServers;
}

router.get(
  '/turn-credentials',
  authMiddleware,
  turnRateLimiter,
  async (req, res) => {
    try {
      const servers = getMeteredServers();

      if (servers.length === 0) {
        console.error(
          'Aucun serveur TURN Metered configuré'
        );

        return res.status(503).json({
          error: 'turn_credentials_unavailable'
        });
      }

      /*
       * On interroge tous les serveurs en parallèle.
       *
       * Si un serveur est temporairement indisponible,
       * les autres peuvent quand même être utilisés.
       */
      const results = await Promise.allSettled(
        servers.map(server =>
          fetchMeteredIceServers(server)
        )
      );

      const allIceServers = [];

      let successfulServers = 0;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successfulServers++;

          for (const iceServer of result.value) {
            allIceServers.push(iceServer);
          }
        } else {
          console.error(
            `Serveur TURN ${servers[index].id} indisponible`
          );
        }
      });

      if (successfulServers === 0) {
        console.error(
          `Tous les serveurs TURN sont indisponibles ` +
          `(utilisateur ${req.user.id})`
        );

        return res.status(502).json({
          error: 'turn_credentials_unavailable'
        });
      }

      /*
       * On mélange les entrées TURN.
       *
       * Ça évite de toujours présenter exactement le même
       * ordre aux clients et peut contribuer à répartir les
       * choix initiaux.
       *
       * Ce n'est PAS un load balancer garanti : WebRTC choisit
       * lui-même les candidats ICE.
       */
      for (let i = allIceServers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [
          allIceServers[i],
          allIceServers[j]
        ] = [
          allIceServers[j],
          allIceServers[i]
        ];
      }

      res.json(allIceServers);

    } catch (err) {
      console.error(
        `Erreur récupération identifiants TURN ` +
        `(utilisateur ${req.user.id})`
      );

      res.status(502).json({
        error: 'turn_credentials_unavailable'
      });
    }
  }
);

module.exports = router;
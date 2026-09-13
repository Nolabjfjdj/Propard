const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

/*
 * Retourne le membre correspondant à un utilisateur.
 *
 * Fonctionne aussi bien lorsque m.userId est :
 * - un ObjectId
 * - un document User après populate()
 */
const memberOf = (group, userId) => {
  const targetId = userId?.toString();

  if (!targetId || !group?.members) {
    return null;
  }

  return group.members.find(member => {
    const memberId =
      member.userId?._id ||
      member.userId;

    return (
      memberId &&
      memberId.toString() === targetId
    );
  });
};

const safeMembers = group =>
  group.members.map(m => {
    const user =
      m.userId &&
      typeof m.userId === 'object'
        ? m.userId
        : null;

    const userId =
      user?._id ||
      m.userId;

    return {
      _id: userId,
      username: user?.username,
      displayName: user?.displayName,
      avatar: user?.avatar,
      publicKey: user?.publicKey,
      role: m.role,
      joinedAt: m.joinedAt,
      lastReadAt: m.lastReadAt
    };
  });

/*
 * Vérifie que les paquets de clés correspondent
 * exactement aux membres du groupe.
 */
const validPackages = (
  packages,
  memberIds,
  version
) => {
  if (!Array.isArray(packages)) {
    return false;
  }

  if (!(memberIds instanceof Set)) {
    return false;
  }

  if (packages.length !== memberIds.size) {
    return false;
  }

  const seen = new Set();

  for (const p of packages) {
    if (!p) {
      return false;
    }

    if (
      !mongoose.isValidObjectId(p.userId) ||
      !mongoose.isValidObjectId(p.senderId)
    ) {
      return false;
    }

    if (p.version !== version) {
      return false;
    }

    if (
      typeof p.encryptedKey !== 'string' ||
      !p.encryptedKey.length ||
      p.encryptedKey.length > 10000
    ) {
      return false;
    }

    const userId =
      p.userId.toString();

    if (seen.has(userId)) {
      return false;
    }

    if (!memberIds.has(userId)) {
      return false;
    }

    seen.add(userId);
  }

  return (
    seen.size ===
    memberIds.size
  );
};


/* =========================
   LISTE DES GROUPES
========================= */

router.get('/', async (req, res) => {
  try {
    const groups =
      await Group.find({
        'members.userId': req.user.id
      })
        .sort({
          lastMessageAt: -1,
          createdAt: -1
        })
        .populate(
          'members.userId',
          'username displayName avatar publicKey'
        );

    const result =
      groups.map(g => {
        const me =
          memberOf(
            g,
            req.user.id
          );

        const obj =
          g.toObject();

        obj.members =
          safeMembers(g);

        obj.memberCount =
          g.members.length;

        obj.unreadCount =
          me?.lastReadAt &&
          g.lastMessageAt &&
          g.lastMessageAt >
            me.lastReadAt
            ? 1
            : 0;

        delete obj.keyPackages;

        return obj;
      });

    res.json(result);
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});


/* =========================
   CRÉATION D'UN GROUPE
========================= */

router.post(
  '/create',
  async (req, res) => {
    try {
      const {
        name,
        avatar = null,
        memberIds = [],
        keyPackages = []
      } = req.body;

      const cleanName =
        typeof name === 'string'
          ? name.trim()
          : '';

      if (
        !cleanName ||
        cleanName.length > 50
      ) {
        return res.status(400).json({
          error:
            'Nom de groupe invalide'
        });
      }

      if (
        !Array.isArray(memberIds) ||
        memberIds.length > 49
      ) {
        return res.status(400).json({
          error:
            'Nombre de membres invalide'
        });
      }

      /*
       * Le créateur est automatiquement
       * ajouté aux membres.
       */
      const uniqueIds = [
        ...new Set([
          req.user.id.toString(),
          ...memberIds.map(
            id => id.toString()
          )
        ])
      ];

      if (
        uniqueIds.some(
          id =>
            !mongoose.isValidObjectId(id)
        )
      ) {
        return res.status(400).json({
          error:
            'Membre invalide'
        });
      }

      const me =
        await User.findById(
          req.user.id
        ).select(
          'friends blockedUsers publicKey'
        );

      if (
        !me ||
        !me.publicKey
      ) {
        return res.status(400).json({
          error:
            'Clé publique indisponible. Recharge la page puis réessaie.'
        });
      }

      const friendIds =
        new Set(
          (me.friends || []).map(
            friend =>
              friend.userId.toString()
          )
        );

      /*
       * Tous les membres sélectionnés
       * doivent être des amis.
       */
      for (
        const id of uniqueIds.slice(1)
      ) {
        if (
          !friendIds.has(id)
        ) {
          return res.status(403).json({
            error:
              'Tous les membres doivent être tes amis.'
          });
        }

        if (
          (me.blockedUsers || []).some(
            blockedId =>
              blockedId.toString() === id
          )
        ) {
          return res.status(403).json({
            error:
              'Membre bloqué.'
          });
        }
      }

      /*
       * Les keyPackages doivent contenir
       * exactement un paquet pour chaque membre,
       * y compris le créateur.
       */
      const memberIdSet =
        new Set(uniqueIds);

      if (
        !validPackages(
          keyPackages,
          memberIdSet,
          1
        )
      ) {
        return res.status(400).json({
          error:
            'Paquets de clés invalides.'
        });
      }

      /*
       * Tous les paquets doivent avoir
       * été chiffrés par le créateur.
       */
      if (
        keyPackages.some(
          p =>
            p.senderId.toString() !==
            req.user.id.toString()
        )
      ) {
        return res.status(400).json({
          error:
            'Émetteur de clé invalide.'
        });
      }

      const group =
        await Group.create({
          name: cleanName,
          avatar: avatar || null,
          owner: req.user.id,

          members:
            uniqueIds.map(
              (id, index) => ({
                userId: id,
                role:
                  index === 0
                    ? 'owner'
                    : 'member'
              })
            ),

          keyVersion: 1,
          keyPackages
        });

      const populated =
        await Group.findById(
          group._id
        ).populate(
          'members.userId',
          'username displayName avatar publicKey'
        );

      if (!populated) {
        return res.status(500).json({
          error:
            'Groupe créé mais impossible de le récupérer.'
        });
      }

      const io =
        req.app.get('io');

      const emitToUser =
        req.app.get(
          'emitToUser'
        );

      for (
        const member of
        populated.members
      ) {
        const memberId =
          member.userId?._id ||
          member.userId;

        emitToUser(
          io,
          memberId.toString(),
          'groupUpdated',
          {
            groupId:
              group._id.toString()
          }
        );
      }

      res.status(201).json({
        ...populated.toObject(),

        members:
          safeMembers(populated),

        memberCount:
          populated.members.length,

        keyPackage:
          populated.keyPackages.find(
            p =>
              p.userId.toString() ===
              req.user.id.toString()
          )
      });
    } catch (e) {
      console.error(
        'Group creation error:',
        e
      );

      res.status(500).json({
        error:
          'Erreur serveur'
      });
    }
  }
);


/* =========================
   INFORMATIONS D'UN GROUPE
========================= */

router.get(
  '/:groupId',
  async (req, res) => {
    try {
      if (
        !mongoose.isValidObjectId(
          req.params.groupId
        )
      ) {
        return res.status(400).json({
          error:
            'ID invalide'
        });
      }

      const group =
        await Group.findById(
          req.params.groupId
        ).populate(
          'members.userId',
          'username displayName avatar publicKey'
        );

      if (!group) {
        return res.status(404).json({
          error:
            'Groupe introuvable'
        });
      }

      const me =
        memberOf(
          group,
          req.user.id
        );

      if (!me) {
        return res.status(403).json({
          error:
            'Tu ne fais pas partie de ce groupe.'
        });
      }

      const obj =
        group.toObject();

      obj.members =
        safeMembers(group);

      obj.memberCount =
        group.members.length;

      obj.keyPackage =
        group.keyPackages.find(
          p =>
            p.userId.toString() ===
            req.user.id.toString()
        ) || null;

      delete obj.keyPackages;

      res.json(obj);
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error:
          'Erreur serveur'
      });
    }
  }
);


/* =========================
   MESSAGES D'UN GROUPE
========================= */

router.get(
  '/:groupId/messages',
  async (req, res) => {
    try {
      if (
        !mongoose.isValidObjectId(
          req.params.groupId
        )
      ) {
        return res.status(400).json({
          error:
            'ID invalide'
        });
      }

      const group =
        await Group.findById(
          req.params.groupId
        ).select('members');

      if (
        !group ||
        !memberOf(
          group,
          req.user.id
        )
      ) {
        return res.status(403).json({
          error:
            'Accès refusé'
        });
      }

      const messages =
        await GroupMessage.find({
          group:
            group._id
        })
          .sort({
            createdAt: 1
          })
          .limit(100)
          .populate(
            'sender',
            'username displayName avatar ipAlias'
          );

      res.json(messages);
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error:
          'Erreur serveur'
      });
    }
  }
);


/* =========================
   MARQUER COMME LU
========================= */

router.patch(
  '/:groupId/read',
  async (req, res) => {
    try {
      const group =
        await Group.findById(
          req.params.groupId
        );

      if (!group) {
        return res.status(404).json({
          error:
            'Groupe introuvable'
        });
      }

      const me =
        memberOf(
          group,
          req.user.id
        );

      if (!me) {
        return res.status(403).json({
          error:
            'Accès refusé'
        });
      }

      me.lastReadAt =
        new Date();

      await group.save();

      res.json({
        success: true
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error:
          'Erreur serveur'
      });
    }
  }
);


/* =========================
   MODIFIER UN GROUPE
========================= */

router.patch(
  '/:groupId',
  async (req, res) => {
    try {
      const group =
        await Group.findById(
          req.params.groupId
        );

      if (!group) {
        return res.status(404).json({
          error:
            'Groupe introuvable'
        });
      }

      const me =
        memberOf(
          group,
          req.user.id
        );

      if (
        !me ||
        !['owner', 'admin'].includes(
          me.role
        )
      ) {
        return res.status(403).json({
          error:
            'Droits insuffisants'
        });
      }

      if (
        req.body.name !==
        undefined
      ) {
        if (
          typeof req.body.name !==
            'string' ||
          !req.body.name.trim() ||
          req.body.name.trim().length >
            50
        ) {
          return res.status(400).json({
            error:
              'Nom invalide'
          });
        }

        group.name =
          req.body.name.trim();
      }

      if (
        req.body.avatar !==
        undefined
      ) {
        if (
          req.body.avatar !== null &&
          typeof req.body.avatar !==
            'string'
        ) {
          return res.status(400).json({
            error:
              'Avatar invalide'
          });
        }

        if (
          typeof req.body.avatar ===
            'string' &&
          req.body.avatar.length >
            1000000
        ) {
          return res.status(400).json({
            error:
              'Avatar trop volumineux'
          });
        }

        group.avatar =
          req.body.avatar || null;
      }

      await group.save();

      const io =
        req.app.get('io');

      const emitToUser =
        req.app.get(
          'emitToUser'
        );

      group.members.forEach(
        member => {
          const memberId =
            member.userId?._id ||
            member.userId;

          emitToUser(
            io,
            memberId.toString(),
            'groupUpdated',
            {
              groupId:
                group._id.toString()
            }
          );
        }
      );

      res.json({
        success: true
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error:
          'Erreur serveur'
      });
    }
  }
);


/* =========================
   SUPPRIMER UN GROUPE
========================= */

router.delete(
  '/:groupId',
  async (req, res) => {
    try {
      const group =
        await Group.findById(
          req.params.groupId
        );

      if (!group) {
        return res.status(404).json({
          error:
            'Groupe introuvable'
        });
      }

      if (
        group.owner.toString() !==
        req.user.id.toString()
      ) {
        return res.status(403).json({
          error:
            'Seul le propriétaire peut supprimer le groupe.'
        });
      }

      await GroupMessage.deleteMany({
        group:
          group._id
      });

      const memberIds =
        group.members.map(
          member =>
            (
              member.userId?._id ||
              member.userId
            ).toString()
        );

      await group.deleteOne();

      const io =
        req.app.get('io');

      const emitToUser =
        req.app.get(
          'emitToUser'
        );

      memberIds.forEach(
        memberId =>
          emitToUser(
            io,
            memberId,
            'groupDeleted',
            {
              groupId:
                group._id.toString()
            }
          )
      );

      res.json({
        success: true
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error:
          'Erreur serveur'
      });
    }
  }
);


/* =========================
   QUITTER UN GROUPE
========================= */

router.post(
  '/:groupId/leave',
  async (req, res) => {
    try {
      const group =
        await Group.findById(
          req.params.groupId
        ).populate(
          'members.userId',
          'publicKey username displayName avatar'
        );

      if (!group) {
        return res.status(404).json({
          error:
            'Groupe introuvable'
        });
      }

      const me =
        memberOf(
          group,
          req.user.id
        );

      if (!me) {
        return res.status(400).json({
          error:
            'Tu ne fais pas partie de ce groupe.'
        });
      }

      if (
        group.owner.toString() ===
        req.user.id.toString()
      ) {
        return res.status(400).json({
          error:
            'Le propriétaire doit supprimer le groupe.'
        });
      }

      const remaining =
        group.members.filter(
          member => {
            const memberId =
              member.userId?._id ||
              member.userId;

            return (
              memberId.toString() !==
              req.user.id.toString()
            );
          }
        );

      const remainingIds =
        new Set(
          remaining.map(member => {
            const memberId =
              member.userId?._id ||
              member.userId;

            return memberId.toString();
          })
        );

      const nextVersion =
        group.keyVersion + 1;

      if (
        !validPackages(
          req.body.keyPackages,
          remainingIds,
          nextVersion
        )
      ) {
        return res.status(400).json({
          error:
            'Rotation de clé invalide.'
        });
      }

      group.members =
        remaining;

      group.keyVersion =
        nextVersion;

      group.keyPackages =
        req.body.keyPackages;

      await group.save();

      const io =
        req.app.get('io');

      const emitToUser =
        req.app.get(
          'emitToUser'
        );

      remaining.forEach(
        member => {
          const memberId =
            member.userId?._id ||
            member.userId;

          emitToUser(
            io,
            memberId.toString(),
            'groupUpdated',
            {
              groupId:
                group._id.toString()
            }
          );
        }
      );

      emitToUser(
        io,
        req.user.id.toString(),
        'groupDeleted',
        {
          groupId:
            group._id.toString()
        }
      );

      res.json({
        success: true
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error:
          'Erreur serveur'
      });
    }
  }
);

module.exports = router;
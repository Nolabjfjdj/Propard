const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);


/* =========================
   HELPERS
========================= */

const memberOf = (group, userId) => {
  const targetId =
    userId?.toString();

  if (
    !targetId ||
    !group?.members
  ) {
    return null;
  }

  return group.members.find(
    member => {
      const memberId =
        member.userId?._id ||
        member.userId;

      return (
        memberId &&
        memberId.toString() ===
          targetId
      );
    }
  );
};


const safeMembers = group =>
  group.members.map(member => {
    const user =
      member.userId &&
      typeof member.userId === 'object'
        ? member.userId
        : null;

    const userId =
      user?._id ||
      member.userId;

    return {
      _id: userId,
      username: user?.username,
      displayName: user?.displayName,
      avatar: user?.avatar,
      publicKey: user?.publicKey,
      role: member.role,
      joinedAt: member.joinedAt,
      lastReadAt: member.lastReadAt
    };
  });


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

  if (
    packages.length !==
    memberIds.size
  ) {
    return false;
  }

  const seen =
    new Set();

  for (
    const packageData of packages
  ) {
    if (!packageData) {
      return false;
    }

    if (
      !mongoose.isValidObjectId(
        packageData.userId
      ) ||
      !mongoose.isValidObjectId(
        packageData.senderId
      )
    ) {
      return false;
    }

    if (
      packageData.version !==
      version
    ) {
      return false;
    }

    if (
      typeof packageData.encryptedKey !==
        'string' ||
      !packageData.encryptedKey.length ||
      packageData.encryptedKey.length >
        10000
    ) {
      return false;
    }

    const userId =
      packageData.userId.toString();

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


const getIo = req =>
  req.app.get('io');


const getEmitToUser = req =>
  req.app.get('emitToUser');


const emitGroupEvent = (
  req,
  group,
  event,
  payload
) => {
  const io =
    getIo(req);

  const emitToUser =
    getEmitToUser(req);

  if (!io || !emitToUser) {
    return;
  }

  for (
    const member of group.members
  ) {
    const memberId =
      member.userId?._id ||
      member.userId;

    if (!memberId) {
      continue;
    }

    emitToUser(
      io,
      memberId.toString(),
      event,
      payload
    );
  }
};


/* =========================
   LISTE DES GROUPES
========================= */

router.get(
  '/',
  async (req, res) => {
    try {
      const groups =
        await Group.find({
          'members.userId':
            req.user.id
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
        groups.map(group => {
          const me =
            memberOf(
              group,
              req.user.id
            );

          const obj =
            group.toObject();

          obj.members =
            safeMembers(group);

          obj.memberCount =
            group.members.length;

          obj.unreadCount =
            me?.lastReadAt &&
            group.lastMessageAt &&
            group.lastMessageAt >
              me.lastReadAt
              ? 1
              : 0;

          delete obj.keyPackages;

          return obj;
        });

      res.json(result);
    } catch (e) {
      console.error(
        'Group list error:',
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
   CRÃATION D'UN GROUPE
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
            !mongoose.isValidObjectId(
              id
            )
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
            'ClÃ© publique indisponible. Recharge la page puis rÃ©essaie.'
        });
      }

      const friendIds =
        new Set(
          (me.friends || []).map(
            friend =>
              friend.userId.toString()
          )
        );

      for (
        const id of uniqueIds.slice(1)
      ) {
        if (
          !friendIds.has(id)
        ) {
          return res.status(403).json({
            error:
              'Tous les membres doivent Ãªtre tes amis.'
          });
        }

        if (
          (me.blockedUsers || []).some(
            blockedId =>
              blockedId.toString() ===
              id
          )
        ) {
          return res.status(403).json({
            error:
              'Membre bloquÃ©.'
          });
        }
      }

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
            'Paquets de clÃ©s invalides.'
        });
      }

      if (
        keyPackages.some(
          packageData =>
            packageData.senderId.toString() !==
            req.user.id.toString()
        )
      ) {
        return res.status(400).json({
          error:
            'Ãmetteur de clÃ© invalide.'
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
            'Groupe crÃ©Ã© mais impossible de le rÃ©cupÃ©rer.'
        });
      }

      emitGroupEvent(
        req,
        populated,
        'groupUpdated',
        {
          groupId:
            group._id.toString()
        }
      );

      res.status(201).json({
        ...populated.toObject(),

        members:
          safeMembers(populated),

        memberCount:
          populated.members.length,

        keyPackage:
          populated.keyPackages.find(
            packageData =>
              packageData.userId.toString() ===
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
          packageData =>
            packageData.userId.toString() ===
            req.user.id.toString()
        ) || null;

      delete obj.keyPackages;

      res.json(obj);
    } catch (e) {
      console.error(
        'Get group error:',
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
            'AccÃ¨s refusÃ©'
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
      console.error(
        'Group messages error:',
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
   MODIFIER UN MESSAGE
========================= */

router.patch(
  '/:groupId/messages/:messageId',
  async (req, res) => {
    try {
      const {
        groupId,
        messageId
      } = req.params;

      if (
        !mongoose.isValidObjectId(groupId) ||
        !mongoose.isValidObjectId(messageId)
      ) {
        return res.status(400).json({
          error:
            'ID invalide'
        });
      }

      const group =
        await Group.findById(
          groupId
        );

      if (
        !group ||
        !memberOf(
          group,
          req.user.id
        )
      ) {
        return res.status(403).json({
          error:
            'AccÃ¨s refusÃ©'
        });
      }

      const encryptedContent =
        req.body?.content;

      /*
       * Le contenu reste chiffrÃ© cÃ´tÃ©
       * client. Le serveur ne voit donc
       * jamais le texte en clair.
       */
      if (
        typeof encryptedContent !==
          'string' ||
        !encryptedContent.trim() ||
        encryptedContent.length >
          20000
      ) {
        return res.status(400).json({
          error:
            'Contenu du message invalide'
        });
      }

      const message =
        await GroupMessage.findOne({
          _id:
            messageId,
          group:
            groupId
        });

      if (!message) {
        return res.status(404).json({
          error:
            'Message introuvable'
        });
      }

      if (
        message.sender.toString() !==
        req.user.id.toString()
      ) {
        return res.status(403).json({
          error:
            'Tu ne peux modifier que tes propres messages.'
        });
      }

      if (message.deleted) {
        return res.status(400).json({
          error:
            'Ce message a dÃ©jÃ  Ã©tÃ© supprimÃ©.'
        });
      }

      message.content =
        encryptedContent.trim();

      message.edited =
        true;

      await message.save();

      emitGroupEvent(
        req,
        group,
        'groupMessageEdited',
        {
          groupId:
            groupId.toString(),
          messageId:
            messageId.toString(),
          content:
            message.content,
          edited:
            true
        }
      );

      res.json({
        success:
          true,
        message: {
          _id:
            message._id,
          group:
            message.group,
          sender:
            message.sender,
          content:
            message.content,
          edited:
            message.edited,
          deleted:
            message.deleted,
          createdAt:
            message.createdAt
        }
      });
    } catch (e) {
      console.error(
        'Group message edit error:',
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
   SUPPRIMER UN MESSAGE
========================= */

router.delete(
  '/:groupId/messages/:messageId',
  async (req, res) => {
    try {
      const {
        groupId,
        messageId
      } = req.params;

      if (
        !mongoose.isValidObjectId(groupId) ||
        !mongoose.isValidObjectId(messageId)
      ) {
        return res.status(400).json({
          error:
            'ID invalide'
        });
      }

      const group =
        await Group.findById(
          groupId
        );

      if (
        !group ||
        !memberOf(
          group,
          req.user.id
        )
      ) {
        return res.status(403).json({
          error:
            'AccÃ¨s refusÃ©'
        });
      }

      const message =
        await GroupMessage.findOne({
          _id:
            messageId,
          group:
            groupId
        });

      if (!message) {
        return res.status(404).json({
          error:
            'Message introuvable'
        });
      }

      if (
        message.sender.toString() !==
        req.user.id.toString()
      ) {
        return res.status(403).json({
          error:
            'Tu ne peux supprimer que tes propres messages.'
        });
      }

      if (message.deleted) {
        return res.json({
          success:
            true
        });
      }

      /*
       * Suppression logique :
       * le document reste prÃ©sent afin
       * de conserver la cohÃ©rence des
       * historiques / signalements.
       */
      message.deleted =
        true;

      message.content =
        '';

      await message.save();

      emitGroupEvent(
        req,
        group,
        'groupMessageDeleted',
        {
          groupId:
            groupId.toString(),
          messageId:
            messageId.toString()
        }
      );

      res.json({
        success:
          true
      });
    } catch (e) {
      console.error(
        'Group message delete error:',
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
   MARQUER COMME LU
========================= */

router.patch(
  '/:groupId/read',
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
            'AccÃ¨s refusÃ©'
        });
      }

      me.lastReadAt =
        new Date();

      await group.save();

      res.json({
        success: true
      });
    } catch (e) {
      console.error(
        'Group read error:',
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
   MODIFIER UN GROUPE
========================= */

router.patch(
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
        );

      if (!group) {
        return res.status(404).json({
          error:
            'Groupe introuvable'
        });
      }

      /*
       * Seul le propriÃ©taire peut
       * modifier le groupe.
       */
      if (
        group.owner.toString() !==
        req.user.id.toString()
      ) {
        return res.status(403).json({
          error:
            'Seul le propriÃ©taire peut modifier le groupe.'
        });
      }

      if (
        req.body.name !==
        undefined
      ) {
        if (
          typeof req.body.name !==
            'string'
        ) {
          return res.status(400).json({
            error:
              'Nom de groupe invalide'
          });
        }

        const cleanName =
          req.body.name.trim();

        if (
          !cleanName ||
          cleanName.length > 50
        ) {
          return res.status(400).json({
            error:
              'Nom de groupe invalide'
          });
        }

        group.name =
          cleanName;
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
            'Impossible de rÃ©cupÃ©rer le groupe aprÃ¨s modification.'
        });
      }

      const obj =
        populated.toObject();

      obj.members =
        safeMembers(
          populated
        );

      obj.memberCount =
        populated.members.length;

      obj.keyPackage =
        populated.keyPackages.find(
          packageData =>
            packageData.userId.toString() ===
            req.user.id.toString()
        ) || null;

      delete obj.keyPackages;

      emitGroupEvent(
        req,
        populated,
        'groupUpdated',
        {
          groupId:
            populated._id.toString()
        }
      );

      res.json(obj);
    } catch (e) {
      console.error(
        'Group update error:',
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
   RETIRER UN MEMBRE
========================= */

router.delete(
  '/:groupId/members/:memberId',
  async (req, res) => {
    try {
      const {
        groupId,
        memberId
      } = req.params;

      if (
        !mongoose.isValidObjectId(
          groupId
        ) ||
        !mongoose.isValidObjectId(
          memberId
        )
      ) {
        return res.status(400).json({
          error:
            'ID invalide'
        });
      }

      const group =
        await Group.findById(
          groupId
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

      /*
       * Seul le propriÃ©taire peut
       * retirer un membre.
       */
      if (
        group.owner.toString() !==
        req.user.id.toString()
      ) {
        return res.status(403).json({
          error:
            'Seul le propriÃ©taire peut retirer un membre.'
        });
      }

      /*
       * Le propriÃ©taire ne peut
       * pas se retirer lui-mÃªme.
       */
      if (
        memberId ===
        group.owner.toString()
      ) {
        return res.status(400).json({
          error:
            'Le propriÃ©taire ne peut pas Ãªtre retirÃ©.'
        });
      }

      const targetMember =
        memberOf(
          group,
          memberId
        );

      if (!targetMember) {
        return res.status(404).json({
          error:
            'Ce membre ne fait pas partie du groupe.'
        });
      }

      /*
       * Membres restants.
       */
      const remaining =
        group.members.filter(
          member => {
            const id =
              member.userId?._id ||
              member.userId;

            return (
              id.toString() !==
              memberId
            );
          }
        );

      const remainingIds =
        new Set(
          remaining.map(
            member => {
              const id =
                member.userId?._id ||
                member.userId;

              return id.toString();
            }
          )
        );

      const nextVersion =
        group.keyVersion + 1;

      /*
       * Le propriÃ©taire doit fournir
       * une nouvelle clÃ© pour tous
       * les membres restants.
       */
      if (
        !validPackages(
          req.body?.keyPackages,
          remainingIds,
          nextVersion
        )
      ) {
        return res.status(400).json({
          error:
            'Rotation de clÃ© invalide.'
        });
      }

      /*
       * Les paquets doivent tous
       * provenir du propriÃ©taire.
       */
      if (
        req.body.keyPackages.some(
          packageData =>
            packageData.senderId.toString() !==
            req.user.id.toString()
        )
      ) {
        return res.status(400).json({
          error:
            'Ãmetteur de clÃ© invalide.'
        });
      }

      /*
       * Rotation de la clÃ©.
       */
      group.members =
        remaining;

      group.keyVersion =
        nextVersion;

      group.keyPackages =
        req.body.keyPackages;

      await group.save();

      /*
       * Les membres restants rechargent
       * le groupe et sa nouvelle clÃ©.
       */
      emitGroupEvent(
        req,
        group,
        'groupUpdated',
        {
          groupId:
            group._id.toString()
        }
      );

      /*
       * Le membre retirÃ© perd immÃ©diatement
       * l'accÃ¨s au groupe.
       */
      const io =
        getIo(req);

      const emitToUser =
        getEmitToUser(req);

      if (
        io &&
        emitToUser
      ) {
        emitToUser(
          io,
          memberId,
          'groupDeleted',
          {
            groupId:
              group._id.toString()
          }
        );
      }

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
            'Groupe modifiÃ© mais impossible de le rÃ©cupÃ©rer.'
        });
      }

      const obj =
        populated.toObject();

      obj.members =
        safeMembers(
          populated
        );

      obj.memberCount =
        populated.members.length;

      obj.keyPackage =
        populated.keyPackages.find(
          packageData =>
            packageData.userId.toString() ===
            req.user.id.toString()
        ) || null;

      delete obj.keyPackages;

      res.json({
        success: true,
        group: obj
      });
    } catch (e) {
      console.error(
        'Remove group member error:',
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
   SUPPRIMER UN GROUPE
========================= */

router.delete(
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
            'Seul le propriÃ©taire peut supprimer le groupe.'
        });
      }

      await GroupMessage.deleteMany({
        group:
          group._id
      });

      const memberIds =
        group.members.map(
          member => {
            const id =
              member.userId?._id ||
              member.userId;

            return id.toString();
          }
        );

      const groupId =
        group._id.toString();

      await group.deleteOne();

      const io =
        getIo(req);

      const emitToUser =
        getEmitToUser(req);

      if (
        io &&
        emitToUser
      ) {
        memberIds.forEach(
          memberId => {
            emitToUser(
              io,
              memberId,
              'groupDeleted',
              {
                groupId
              }
            );
          }
        );
      }

      res.json({
        success: true
      });
    } catch (e) {
      console.error(
        'Group deletion error:',
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
   QUITTER UN GROUPE
========================= */

router.post(
  '/:groupId/leave',
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
            'Le propriÃ©taire doit supprimer le groupe.'
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
          remaining.map(
            member => {
              const memberId =
                member.userId?._id ||
                member.userId;

              return memberId.toString();
            }
          )
        );

      const nextVersion =
        group.keyVersion + 1;

      if (
        !validPackages(
          req.body?.keyPackages,
          remainingIds,
          nextVersion
        )
      ) {
        return res.status(400).json({
          error:
            'Rotation de clÃ© invalide.'
        });
      }

      group.members =
        remaining;

      group.keyVersion =
        nextVersion;

      group.keyPackages =
        req.body.keyPackages;

      await group.save();

      emitGroupEvent(
        req,
        group,
        'groupUpdated',
        {
          groupId:
            group._id.toString()
        }
      );

      const io =
        getIo(req);

      const emitToUser =
        getEmitToUser(req);

      if (
        io &&
        emitToUser
      ) {
        emitToUser(
          io,
          req.user.id.toString(),
          'groupDeleted',
          {
            groupId:
              group._id.toString()
          }
        );
      }

      res.json({
        success: true
      });
    } catch (e) {
      console.error(
        'Group leave error:',
        e
      );

      res.status(500).json({
        error:
          'Erreur serveur'
      });
    }
  }
);


module.exports = router;
import React, {
  useEffect,
  useMemo,
  useState
} from 'react';

import axios from 'axios';

import {
  encryptGroupKeyForMember,
  generateGroupKey
} from '../utils/groupCrypto';

import { 
  getStoredPrivateKeyJwk
} from "../utils/crypto";


export default function GroupProfile({
  group: initialGroup,
  token,
  userId,
  onBack,
  onUpdated
}) {
  const [group, setGroup] =
    useState(initialGroup);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [editing, setEditing] =
    useState(false);

  const [name, setName] =
    useState(initialGroup?.name || '');

  const [avatar, setAvatar] =
    useState(initialGroup?.avatar || '');

  const [saving, setSaving] =
    useState(false);

  const [removingId, setRemovingId] =
    useState(null);

  const [friends, setFriends] =
    useState([]);

  const [showAvatarInput, setShowAvatarInput] =
    useState(false);


  const myId =
    userId?.toString();


  const isOwner =
    group?.owner?.toString() ===
    myId;


  /*
   * Charge les informations complètes
   * du groupe.
   */
  const loadGroup = async () => {
    if (!initialGroup?._id) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res =
        await axios.get(
          `/api/groups/${initialGroup._id}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      setGroup(res.data);

      setName(
        res.data?.name || ''
      );

      setAvatar(
        res.data?.avatar || ''
      );
    } catch (err) {
      console.error(
        'Erreur chargement profil groupe:',
        err
      );

      setError(
        err.response?.data?.error ||
        'Impossible de charger le profil du groupe.'
      );
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadGroup();
  }, [
    initialGroup?._id,
    token
  ]);


  /*
   * Récupère les relations d'amis afin
   * d'afficher les surnoms personnalisés.
   */
  useEffect(() => {
    let cancelled = false;

    const loadFriends = async () => {
      try {
        const res =
          await axios.get(
            '/api/auth/me',
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        if (!cancelled) {
          setFriends(
            Array.isArray(
              res.data?.friends
            )
              ? res.data.friends
              : []
          );
        }
      } catch (err) {
        console.error(
          'Erreur chargement amis:',
          err
        );
      }
    };

    if (token) {
      loadFriends();
    }

    return () => {
      cancelled = true;
    };
  }, [token]);


  /*
   * Retourne le surnom affiché par
   * l'utilisateur pour un membre.
   */
  const getMemberName =
    member => {
      const memberId =
        member?._id?.toString();

      const friend =
        friends.find(
          item =>
            item.userId?._id?.toString() ===
              memberId ||
            item.userId?.toString() ===
              memberId
        );

      return (
        friend?.nickname?.trim() ||
        member?.displayName?.trim() ||
        member?.username ||
        'Membre'
      );
    };


  /*
   * Membres triés : propriétaire en premier.
   */
  const sortedMembers =
    useMemo(() => {
      if (!group?.members) {
        return [];
      }

      return [
        ...group.members
      ].sort((a, b) => {
        if (
          a._id?.toString() ===
          group.owner?.toString()
        ) {
          return -1;
        }

        if (
          b._id?.toString() ===
          group.owner?.toString()
        ) {
          return 1;
        }

        return 0;
      });
    }, [
      group
    ]);


  /*
   * Sélection d'une photo locale.
   *
   * On utilise une data URL afin que la photo
   * puisse être envoyée directement à l'API
   * sans nécessiter un système de stockage
   * supplémentaire.
   */
  const handleAvatarFile =
    event => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      if (
        !file.type.startsWith(
          'image/'
        )
      ) {
        setError(
          'Le fichier doit être une image.'
        );

        return;
      }

      /*
       * Limite raisonnable pour éviter
       * une énorme data URL.
       */
      if (
        file.size >
        2 * 1024 * 1024
      ) {
        setError(
          'La photo ne doit pas dépasser 2 Mo.'
        );

        return;
      }

      const reader =
        new FileReader();

      reader.onload = () => {
        setAvatar(
          reader.result
        );

        setError('');
      };

      reader.onerror = () => {
        setError(
          'Impossible de lire cette image.'
        );
      };

      reader.readAsDataURL(
        file
      );
    };


  /*
   * Enregistrement du nom / avatar.
   */
  const saveChanges =
    async () => {
      const cleanName =
        name.trim();

      if (!cleanName) {
        setError(
          'Le nom du groupe ne peut pas être vide.'
        );

        return;
      }

      if (
        cleanName.length > 50
      ) {
        setError(
          'Le nom du groupe est trop long.'
        );

        return;
      }

      try {
        setSaving(true);
        setError('');

        const res =
          await axios.patch(
            `/api/groups/${group._id}`,
            {
              name:
                cleanName,
              avatar:
                avatar || null
            },
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        const updatedGroup =
          res.data;

        setGroup(
          updatedGroup
        );

        setName(
          updatedGroup?.name ||
          cleanName
        );

        setAvatar(
          updatedGroup?.avatar ||
          ''
        );

        setEditing(false);

        onUpdated?.(
          updatedGroup
        );
      } catch (err) {
        console.error(
          'Erreur modification groupe:',
          err
        );

        setError(
          err.response?.data?.error ||
          'Impossible de modifier le groupe.'
        );
      } finally {
        setSaving(false);
      }
    };


  /*
   * Retirer un membre.
   *
   * Le backend doit effectuer la rotation
   * de la clé du groupe.
   */
  const removeMember =
    async member => {
      if (!isOwner) {
        return;
      }

      const memberId =
        member?._id?.toString();

      if (!memberId) {
        return;
      }

      if (
        memberId === myId
      ) {
        return;
      }

      const memberName =
        getMemberName(member);

      const confirmed =
        window.confirm(
          `Retirer ${memberName} du groupe ?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setRemovingId(
          memberId
        );

        setError('');

        /*
         * Récupération de la clé privée
         * locale de l'utilisateur.
         */
        const privateKey =
          getStoredPrivateKeyJwk(
            myId
          );

        if (!privateKey) {
          throw new Error(
            'Clé privée locale introuvable.'
          );
        }

        /*
         * Nouvelle clé pour les membres
         * qui restent dans le groupe.
         */
        const nextGroupKey =
          await generateGroupKey();

        const nextVersion =
          (group.keyVersion || 1) + 1;

        const remainingMembers =
          group.members.filter(
            current =>
              current._id?.toString() !==
              memberId
          );

        const keyPackages =
          [];

        for (
          const remainingMember of
          remainingMembers
        ) {
          const remainingId =
            remainingMember._id?.toString();

          if (!remainingId) {
            continue;
          }

          if (
            !remainingMember.publicKey
          ) {
            throw new Error(
              `La clé publique de ${getMemberName(
                remainingMember
              )} est indisponible.`
            );
          }

          const publicKey =
            typeof remainingMember.publicKey ===
            'string'
              ? JSON.parse(
                  remainingMember.publicKey
                )
              : remainingMember.publicKey;

          const encryptedKey =
            await encryptGroupKeyForMember(
              nextGroupKey,
              privateKey,
              publicKey
            );

          keyPackages.push({
            userId:
              remainingId,

            senderId:
              myId,

            version:
              nextVersion,

            encryptedKey
          });
        }

        const res =
          await axios.delete(
            `/api/groups/${group._id}/members/${memberId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              },

              data: {
                keyPackages
              }
            }
          );

        /*
         * Le backend peut renvoyer le groupe
         * directement après modification.
         */
        const updatedGroup =
          res.data?.group ||
          res.data;

        if (
          updatedGroup &&
          updatedGroup._id
        ) {
          setGroup(
            updatedGroup
          );

          setName(
            updatedGroup.name || ''
          );

          setAvatar(
            updatedGroup.avatar || ''
          );
        } else {
          await loadGroup();
        }

        /*
         * On laisse GroupChat recharger
         * la nouvelle clé via keyVersion.
         */
        onUpdated?.(
          updatedGroup
        );

      } catch (err) {
        console.error(
          'Erreur retrait membre:',
          err
        );

        setError(
          err.response?.data?.error ||
          err.message ||
          'Impossible de retirer ce membre.'
        );
      } finally {
        setRemovingId(
          null
        );
      }
    };


  if (loading) {
    return (
      <div
        style={
          styles.container
        }
      >
        <div
          style={
            styles.loading
          }
        >
          Chargement...
        </div>
      </div>
    );
  }


  return (
    <div
      style={
        styles.container
      }
    >

      {/* HEADER */}

      <div
        style={
          styles.header
        }
      >

        <button
          type="button"
          onClick={onBack}
          style={
            styles.backButton
          }
          aria-label="Retour"
        >
          ←
        </button>

        <div
          style={
            styles.headerTitle
          }
        >
          Profil du groupe
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={() => {
              setEditing(
                value => !value
              );

              setError('');
            }}
            style={
              styles.editButton
            }
          >
            {editing
              ? 'Annuler'
              : 'Modifier'}
          </button>
        )}

      </div>


      <div
        style={
          styles.content
        }
      >

        {error && (
          <div
            style={
              styles.error
            }
          >
            {error}
          </div>
        )}


        {/* IDENTITÉ DU GROUPE */}

        <section
          style={
            styles.identityCard
          }
        >

          <div
            style={
              styles.avatarWrapper
            }
          >

            <div
              style={
                styles.groupAvatar
              }
            >

              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  style={
                    styles.groupAvatarImage
                  }
                />
              ) : (
                (
                  group?.name ||
                  '?'
                )[0].toUpperCase()
              )}

            </div>


            {editing &&
              isOwner && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setShowAvatarInput(
                        value => !value
                      )
                    }
                    style={
                      styles.changeAvatarButton
                    }
                  >
                    📷
                  </button>

                  {showAvatarInput && (
                    <div
                      style={
                        styles.avatarChooser
                      }
                    >
                      <label
                        style={
                          styles.fileLabel
                        }
                      >
                        Choisir une photo

                        <input
                          type="file"
                          accept="image/*"
                          onChange={
                            handleAvatarFile
                          }
                          style={
                            styles.fileInput
                          }
                        />
                      </label>

                      {avatar && (
                        <button
                          type="button"
                          onClick={() => {
                            setAvatar('');
                            setShowAvatarInput(
                              false
                            );
                          }}
                          style={
                            styles.removeAvatarButton
                          }
                        >
                          Supprimer la photo
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

          </div>


          {editing &&
          isOwner ? (
            <input
              value={name}
              onChange={e =>
                setName(
                  e.target.value
                )
              }
              maxLength={50}
              autoFocus
              style={
                styles.nameInput
              }
              placeholder="Nom du groupe"
            />
          ) : (
            <h1
              style={
                styles.groupName
              }
            >
              {group?.name}
            </h1>
          )}


          <p
            style={
              styles.memberCount
            }
          >
            {group?.members?.length ||
              0}{' '}
            membre
            {(group?.members?.length ||
              0) > 1
              ? 's'
              : ''}
          </p>

        </section>


        {/* BOUTON ENREGISTRER */}

        {editing &&
          isOwner && (
            <button
              type="button"
              onClick={
                saveChanges
              }
              disabled={saving}
              style={
                styles.saveButton
              }
            >
              {saving
                ? 'Enregistrement...'
                : 'Enregistrer les modifications'}
            </button>
          )}


        {/* MEMBRES */}

        <section
          style={
            styles.membersSection
          }
        >

          <div
            style={
              styles.sectionHeader
            }
          >
            <h2
              style={
                styles.sectionTitle
              }
            >
              Membres
            </h2>

            <span
              style={
                styles.sectionCount
              }
            >
              {group?.members?.length ||
                0}
            </span>
          </div>


          <div
            style={
              styles.membersList
            }
          >

            {sortedMembers.map(
              member => {
                const memberId =
                  member._id?.toString();

                const memberName =
                  getMemberName(
                    member
                  );

                const memberIsOwner =
                  memberId ===
                  group.owner?.toString();

                const removing =
                  removingId ===
                  memberId;

                return (
                  <div
                    key={
                      memberId
                    }
                    style={
                      styles.memberRow
                    }
                  >

                    <div
                      style={
                        styles.memberAvatar
                      }
                    >
                      {member.avatar ? (
                        <img
                          src={
                            member.avatar
                          }
                          alt=""
                          style={
                            styles.memberAvatarImage
                          }
                        />
                      ) : (
                        memberName[0]
                          ? memberName[0].toUpperCase()
                          : '?'
                      )}
                    </div>


                    <div
                      style={
                        styles.memberInfo
                      }
                    >

                      <div
                        style={
                          styles.memberNameLine
                        }
                      >
                        <span
                          style={
                            styles.memberName
                          }
                        >
                          {memberName}
                        </span>

                        {memberIsOwner && (
                          <span
                            style={
                              styles.ownerBadge
                            }
                          >
                            Propriétaire
                          </span>
                        )}
                      </div>


                      {member.username &&
                        memberName !==
                          member.username && (
                          <span
                            style={
                              styles.username
                            }
                          >
                            @{member.username}
                          </span>
                        )}

                    </div>


                    {isOwner &&
                      !memberIsOwner &&
                      memberId !==
                        myId && (
                        <button
                          type="button"
                          disabled={
                            removing
                          }
                          onClick={() =>
                            removeMember(
                              member
                            )
                          }
                          style={
                            styles.removeButton
                          }
                        >
                          {removing
                            ? '...'
                            : 'Retirer'}
                        </button>
                      )}

                  </div>
                );
              }
            )}

          </div>

        </section>


        {/* INFORMATIONS */}

        <section
          style={
            styles.infoCard
          }
        >

          <div
            style={
              styles.infoRow
            }
          >
            <span
              style={
                styles.infoLabel
              }
            >
              Créé le
            </span>

            <span
              style={
                styles.infoValue
              }
            >
              {group?.createdAt
                ? new Date(
                    group.createdAt
                  ).toLocaleDateString(
                    'fr-FR',
                    {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    }
                  )
                : '—'}
            </span>
          </div>


          <div
            style={
              styles.infoRow
            }
          >
            <span
              style={
                styles.infoLabel
              }
            >
              Version de chiffrement
            </span>

            <span
              style={
                styles.infoValue
              }
            >
              v{group?.keyVersion ||
                1}
            </span>
          </div>

        </section>

      </div>

    </div>
  );
}


const styles = {
  container: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    background:
      'var(--bg-primary)',
    color:
      'var(--text-primary)'
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding:
      '12px 16px',
    background:
      'var(--bg-secondary)',
    borderBottom:
      '1px solid var(--border)',
    flexShrink: 0
  },

  backButton: {
    width: '36px',
    height: '36px',
    border: 0,
    borderRadius: '8px',
    background:
      'var(--bg-tertiary)',
    color:
      'var(--text-primary)',
    fontSize: '20px',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center'
  },

  headerTitle: {
    flex: 1,
    fontSize: '16px',
    fontWeight: '700',
    color:
      'var(--text-primary)'
  },

  editButton: {
    border:
      '1px solid var(--border)',
    background:
      'var(--bg-tertiary)',
    color:
      'var(--text-primary)',
    borderRadius: '8px',
    padding:
      '7px 11px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  content: {
    flex: 1,
    overflowY: 'auto',
    width: '100%',
    maxWidth: '700px',
    margin: '0 auto',
    boxSizing: 'border-box',
    padding:
      '24px 16px 40px'
  },

  loading: {
    flex: 1,
    display: 'grid',
    placeItems: 'center',
    color:
      'var(--text-muted)',
    fontSize: '14px'
  },

  error: {
    background:
      'rgba(240,91,91,0.1)',
    border:
      '1px solid var(--danger)',
    color:
      'var(--danger)',
    borderRadius: '9px',
    padding:
      '10px 12px',
    marginBottom: '14px',
    fontSize: '13px'
  },

  identityCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding:
      '10px 0 24px'
  },

  avatarWrapper: {
    position: 'relative',
    marginBottom: '14px'
  },

  groupAvatar: {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    background:
      'var(--accent-glow)',
    border:
      '2px solid var(--accent)',
    color:
      'var(--accent)',
    display: 'grid',
    placeItems: 'center',
    fontSize: '38px',
    fontWeight: '800',
    overflow: 'hidden'
  },

  groupAvatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
  },

  changeAvatarButton: {
    position: 'absolute',
    right: '-4px',
    bottom: '-4px',
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border:
      '2px solid var(--bg-primary)',
    background:
      'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center'
  },

  avatarChooser: {
    position: 'absolute',
    top: '108px',
    left: '50%',
    transform:
      'translateX(-50%)',
    zIndex: 20,
    width: '190px',
    padding: '10px',
    background:
      'var(--bg-secondary)',
    border:
      '1px solid var(--border)',
    borderRadius: '9px',
    boxShadow:
      'var(--shadow)'
  },

  fileLabel: {
    display: 'block',
    padding:
      '9px 10px',
    background:
      'var(--bg-tertiary)',
    border:
      '1px solid var(--border)',
    borderRadius: '7px',
    color:
      'var(--text-primary)',
    fontSize: '12px',
    textAlign: 'center',
    cursor: 'pointer'
  },

  fileInput: {
    display: 'none'
  },

  removeAvatarButton: {
    width: '100%',
    marginTop: '6px',
    padding: '8px',
    border: 0,
    borderRadius: '7px',
    background:
      'rgba(240,91,91,0.1)',
    color:
      'var(--danger)',
    fontSize: '11px',
    cursor: 'pointer'
  },

  groupName: {
    margin: 0,
    color:
      'var(--text-primary)',
    fontSize: '21px',
    fontWeight: '700',
    textAlign: 'center',
    overflowWrap: 'anywhere'
  },

  nameInput: {
    width: '100%',
    maxWidth: '380px',
    boxSizing: 'border-box',
    padding:
      '10px 12px',
    background:
      'var(--bg-tertiary)',
    border:
      '1px solid var(--accent)',
    borderRadius: '8px',
    color:
      'var(--text-primary)',
    fontSize: '18px',
    fontWeight: '600',
    textAlign: 'center',
    outline: 'none'
  },

  memberCount: {
    margin:
      '5px 0 0',
    color:
      'var(--text-muted)',
    fontSize: '12px'
  },

  saveButton: {
    width: '100%',
    border: 0,
    borderRadius: '8px',
    padding: '11px 14px',
    background:
      'var(--accent)',
    color: '#fff',
    fontWeight: '700',
    cursor: 'pointer',
    marginBottom: '20px'
  },

  membersSection: {
    background:
      'var(--bg-secondary)',
    border:
      '1px solid var(--border)',
    borderRadius: '12px',
    overflow: 'hidden'
  },

  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding:
      '13px 14px',
    borderBottom:
      '1px solid var(--border)'
  },

  sectionTitle: {
    margin: 0,
    flex: 1,
    fontSize: '12px',
    textTransform:
      'uppercase',
    letterSpacing:
      '0.04em',
    color:
      'var(--text-muted)'
  },

  sectionCount: {
    minWidth: '22px',
    height: '22px',
    padding:
      '0 6px',
    borderRadius: '11px',
    background:
      'var(--accent-glow)',
    color:
      'var(--accent)',
    fontSize: '11px',
    fontWeight: '700',
    display: 'grid',
    placeItems: 'center'
  },

  membersList: {
    display: 'flex',
    flexDirection: 'column'
  },

  memberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding:
      '10px 12px',
    borderBottom:
      '1px solid var(--border)'
  },

  memberAvatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
    background:
      'var(--accent-glow)',
    color:
      'var(--accent)',
    display: 'grid',
    placeItems: 'center',
    fontWeight: '700'
  },

  memberAvatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
  },

  memberInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },

  memberNameLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0
  },

  memberName: {
    color:
      'var(--text-primary)',
    fontSize: '13px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    overflow: 'visible',
    textOverflow: 'clip'
  },

  ownerBadge: {
    flexShrink: 0,
    color:
      'var(--accent)',
    background:
      'var(--accent-glow)',
    borderRadius: '5px',
    padding:
      '2px 5px',
    fontSize: '9px',
    fontWeight: '700'
  },

  username: {
    color:
      'var(--text-muted)',
    fontSize: '10px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },

  removeButton: {
    flexShrink: 0,
    border:
      '1px solid rgba(240,91,91,0.35)',
    background:
      'rgba(240,91,91,0.08)',
    color:
      'var(--danger)',
    borderRadius: '7px',
    padding:
      '6px 8px',
    fontSize: '10px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  infoCard: {
    marginTop: '14px',
    background:
      'var(--bg-secondary)',
    border:
      '1px solid var(--border)',
    borderRadius: '12px',
    overflow: 'hidden'
  },

  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    padding:
      '11px 13px',
    borderBottom:
      '1px solid var(--border)'
  },

  infoLabel: {
    color:
      'var(--text-muted)',
    fontSize: '11px'
  },

  infoValue: {
    color:
      'var(--text-secondary)',
    fontSize: '11px',
    textAlign: 'right'
  }
};
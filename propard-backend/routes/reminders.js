const express = require('express');
const mongoose = require('mongoose');
const Reminder = require('../models/Reminder');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authMiddleware);

const reminderLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: req => 'reminders:' + req.user.id,
  message: 'Trop de modifications de rappels. Réessaie plus tard.'
});

const reminderReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyFn: req => 'reminders-read:' + req.user.id,
  message: 'Trop de consultations des rappels. Réessaie dans une minute.'
});

router.get('/', reminderReadLimiter, async (req, res) => {
  try {
    const reminders = await Reminder.find({
      user: req.user.id,
      status: { $in: ['pending', 'sent', 'failed'] }
    }).sort({ dueAt: 1 }).limit(100).select('title note dueAt status sentAt createdAt');
    res.json({ reminders });
  } catch (error) {
    console.error('Reminder list failed:', error);
    res.status(500).json({ error: 'Impossible de charger les rappels.' });
  }
});

router.post('/', reminderLimiter, async (req, res) => {
  try {
    const { title, note, dueAt } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 80) {
      return res.status(400).json({ error: 'Le titre doit contenir entre 1 et 80 caractères.' });
    }
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 240)) {
      return res.status(400).json({ error: 'La note ne peut pas dépasser 240 caractères.' });
    }
    const parsedDate = new Date(dueAt);
    const now = Date.now();
    if (!dueAt || !Number.isFinite(parsedDate.getTime()) || parsedDate.getTime() < now + 60 * 1000 || parsedDate.getTime() > now + 366 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Choisis une date située entre 1 minute et 1 an dans le futur.' });
    }
    const account = await User.findById(req.user.id).select('pushSubscriptions apnsTokens');
    if (!account || (!(account.pushSubscriptions || []).length && !(account.apnsTokens || []).length)) {
      return res.status(409).json({ error: 'Active les notifications sur ton appareil avant de créer un rappel.' });
    }
    const reminder = await Reminder.create({
      user: req.user.id,
      title: title.trim(),
      note: typeof note === 'string' ? note.trim() || null : null,
      dueAt: parsedDate
    });
    res.status(201).json({ reminder });
  } catch (error) {
    console.error('Reminder create failed:', error);
    res.status(500).json({ error: 'Impossible de créer le rappel.' });
  }
});

router.patch('/:reminderId/cancel', reminderLimiter, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reminderId)) {
      return res.status(400).json({ error: 'Rappel invalide.' });
    }
    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.reminderId, user: req.user.id, status: 'pending' },
      { $set: { status: 'cancelled' } },
      { returnDocument: 'after' }
    );
    if (!reminder) return res.status(404).json({ error: 'Rappel introuvable ou déjà déclenché.' });
    res.json({ success: true, reminder });
  } catch (error) {
    console.error('Reminder cancellation failed:', error);
    res.status(500).json({ error: 'Impossible d’annuler le rappel.' });
  }
});

router.delete('/:reminderId', reminderLimiter, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reminderId)) {
      return res.status(400).json({ error: 'Rappel invalide.' });
    }
    const result = await Reminder.deleteOne({ _id: req.params.reminderId, user: req.user.id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Rappel introuvable.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Reminder deletion failed:', error);
    res.status(500).json({ error: 'Impossible de supprimer le rappel.' });
  }
});

module.exports = router;

"""Bande-son d'ambiance synthétique (30 s, 48 kHz, stéréo) calée sur les scènes de la vidéo CheckSanté.

Nappe d'accords (la mineur), basse, pulsation douce, souffles aux transitions et impacts sur le logo.
Usage : python3 scripts/soundtrack.py sortie.wav
"""
import sys
import wave

import numpy as np

SR, DUR = 48000, 30.0
t = np.arange(int(SR * DUR)) / SR
rng = np.random.default_rng(7)
CUTS = [3.15, 9.4, 14.4, 20.9, 26.4]


def note(n):  # n = demi-tons depuis La4 (440 Hz)
    return 440.0 * 2 ** (n / 12)


# Accords par section (demi-tons relatifs à La4) : Am – F – C – G – Am – F
CHORDS = [
    (0.0, [-24, -12, -9, -5, 0]),  # Am
    (3.15, [-28, -16, -12, -9, -4]),  # F
    (9.4, [-21, -9, -5, -2, 3]),  # C
    (14.4, [-26, -14, -10, -7, -2]),  # G
    (20.9, [-24, -12, -9, -5, 0]),  # Am
    (26.4, [-28, -16, -12, -9, -4]),  # F
]


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def pad_voice(freq, detune):
    """Son « nappe » : quelques harmoniques douces, légèrement désaccordées."""
    out = np.zeros_like(t)
    for h, amp in [(1, 1.0), (2, 0.35), (3, 0.16), (4, 0.07)]:
        for d in (-detune, detune):
            out += amp * np.sin(2 * np.pi * freq * h * (1 + d) * t + rng.uniform(0, 6.28))
    return out


pad = np.zeros_like(t)
for i, (start, notes) in enumerate(CHORDS):
    end = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else DUR
    env = smoothstep((t - (start - 0.4)) / 1.2) * (1 - smoothstep((t - (end - 0.4)) / 1.2))
    chord = sum(pad_voice(note(n), 0.0025) * (0.6 if k == 0 else 0.35) for k, n in enumerate(notes))
    pad += chord * env
pad *= 0.9 + 0.1 * np.sin(2 * np.pi * 0.25 * t)  # léger mouvement

# Basse (sinus) sur la fondamentale
bass = np.zeros_like(t)
for i, (start, notes) in enumerate(CHORDS):
    end = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else DUR
    env = smoothstep((t - start) / 0.3) * (1 - smoothstep((t - (end - 0.2)) / 0.3))
    bass += np.sin(2 * np.pi * note(notes[0] - 12) * t) * env

# Pulsation douce (96 bpm) à partir de la première étape
beat = 60 / 96
kick = np.zeros_like(t)
for bt in np.arange(3.15, 26.4, beat):
    m = t >= bt
    dt = t[m] - bt
    kick[m] += np.sin(2 * np.pi * (48 + 50 * np.exp(-dt * 30)) * dt) * np.exp(-dt * 9)
tick = np.zeros_like(t)
noise = rng.standard_normal(len(t))
hp = noise - np.convolve(noise, np.ones(8) / 8, mode='same')  # bruit aigu
for bt in np.arange(3.15 + beat / 2, 26.4, beat):
    m = (t >= bt) & (t < bt + 0.08)
    tick[m] += hp[m] * np.exp(-(t[m] - bt) * 60)

# Souffles de transition (bruit filtré, montée/descente)
whoosh = np.zeros_like(t)
lp = np.convolve(noise, np.ones(40) / 40, mode='same')
for c in CUTS:
    env = np.exp(-((t - c) / 0.28) ** 2)
    whoosh += lp * env * (1 + 0.5 * np.sin(2 * np.pi * 3 * (t - c)))

# Impacts (logo à 1,0 s ; titre final à 27,6 s)
boom = np.zeros_like(t)
for c, g in [(1.0, 1.0), (27.6, 0.9)]:
    m = t >= c
    dt = t[m] - c
    boom[m] += g * np.sin(2 * np.pi * (35 + 60 * np.exp(-dt * 6)) * dt) * np.exp(-dt * 2.2)

# Clochette douce sur les validations (2 accords, option check-up, inscription, orange, arrivée chez le médecin)
bell = np.zeros_like(t)
for c, n in [(6.4, 12), (6.75, 15), (7.25, 17), (8.1, 19), (17.0, 14), (23.4, 19), (24.0, 24)]:
    m = t >= c
    dt = t[m] - c
    f = note(n)
    bell[m] += (np.sin(2 * np.pi * f * dt) + 0.4 * np.sin(2 * np.pi * f * 2.01 * dt)) * np.exp(-dt * 4)

mixL = 0.16 * pad + 0.22 * bass + 0.30 * kick + 0.05 * tick + 0.10 * whoosh + 0.45 * boom + 0.10 * bell
mixR = 0.16 * np.roll(pad, 240) + 0.22 * bass + 0.30 * kick + 0.05 * np.roll(tick, 90) + 0.10 * np.roll(whoosh, 400) + 0.45 * boom + 0.10 * bell

fade = smoothstep(t / 1.0) * (1 - smoothstep((t - 28.8) / 1.2))
stereo = np.stack([mixL * fade, mixR * fade], axis=1)
stereo /= np.max(np.abs(stereo)) / 0.7  # crête à -3 dB environ
pcm = (stereo * 32767).astype('<i2')

with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('ok', sys.argv[1])

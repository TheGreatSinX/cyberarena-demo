import blueThinkerImg from '../../assets/images/avatar_blue_thinker_1791022512491.jpg';
import princessImg from '../../assets/images/avatar_princess_1791022528607.jpg';
import robotImg from '../../assets/images/avatar_robot_1791022543588.jpg';
import gamerImg from '../../assets/images/avatar_gamer_1791022558902.jpg';
import catImg from '../../assets/images/avatar_cat_1791022575755.jpg';
import ideaGirlImg from '../../assets/images/avatar_idea_girl_1791022590203.jpg';
import astronautImg from '../../assets/images/avatar_astronaut_1791022605515.jpg';
import dinoImg from '../../assets/images/avatar_dino_1791022624148.jpg';
import smartBunImg from '../../assets/images/avatar_smart_bun_1791022638996.jpg';
import cyberBoyImg from '../../assets/images/avatar_cyber_boy_1791022654161.jpg';

export interface PlayerAvatar {
  id: string;
  name: string;
  title: string;
  accentColor: string;
  ringClass: string;
  bgGlowClass: string;
  imageUrl: string;
}

export const PLAYER_AVATARS: PlayerAvatar[] = [
  {
    id: 'blue_thinker',
    name: 'Brainy Blue',
    title: 'The Thinker',
    accentColor: '#06b6d4',
    ringClass: 'ring-cyan-400 border-cyan-400',
    bgGlowClass: 'from-cyan-500/20 to-blue-600/20',
    imageUrl: blueThinkerImg,
  },
  {
    id: 'princess',
    name: 'Quiz Queen',
    title: 'Crown Champion',
    accentColor: '#ec4899',
    ringClass: 'ring-pink-500 border-pink-500',
    bgGlowClass: 'from-pink-500/20 to-rose-600/20',
    imageUrl: princessImg,
  },
  {
    id: 'robot',
    name: 'Cyber Bot',
    title: 'AI Prodigy',
    accentColor: '#00e5ff',
    ringClass: 'ring-teal-400 border-teal-400',
    bgGlowClass: 'from-teal-500/20 to-cyan-600/20',
    imageUrl: robotImg,
  },
  {
    id: 'gamer',
    name: 'Pro Gamer',
    title: 'Speed Runner',
    accentColor: '#f97316',
    ringClass: 'ring-amber-500 border-amber-500',
    bgGlowClass: 'from-amber-500/20 to-orange-600/20',
    imageUrl: gamerImg,
  },
  {
    id: 'cat',
    name: 'Scholar Cat',
    title: 'Honor Student',
    accentColor: '#eab308',
    ringClass: 'ring-yellow-400 border-yellow-400',
    bgGlowClass: 'from-yellow-500/20 to-amber-600/20',
    imageUrl: catImg,
  },
  {
    id: 'idea_girl',
    name: 'Bright Spark',
    title: 'Idea Machine',
    accentColor: '#fbbf24',
    ringClass: 'ring-orange-400 border-orange-400',
    bgGlowClass: 'from-yellow-400/20 to-orange-500/20',
    imageUrl: ideaGirlImg,
  },
  {
    id: 'astronaut',
    name: 'Astro Kid',
    title: 'Star Explorer',
    accentColor: '#38bdf8',
    ringClass: 'ring-sky-400 border-sky-400',
    bgGlowClass: 'from-sky-500/20 to-indigo-600/20',
    imageUrl: astronautImg,
  },
  {
    id: 'dino',
    name: 'Quizasaurus',
    title: 'Prehistoric Brain',
    accentColor: '#22c55e',
    ringClass: 'ring-emerald-400 border-emerald-400',
    bgGlowClass: 'from-emerald-500/20 to-green-600/20',
    imageUrl: dinoImg,
  },
  {
    id: 'smart_bun',
    name: 'Book Smart',
    title: 'Trivia Master',
    accentColor: '#a855f7',
    ringClass: 'ring-purple-400 border-purple-400',
    bgGlowClass: 'from-purple-500/20 to-indigo-600/20',
    imageUrl: smartBunImg,
  },
  {
    id: 'cyber_boy',
    name: 'Glitch Ninja',
    title: 'Neon Hacker',
    accentColor: '#f43f5e',
    ringClass: 'ring-rose-500 border-rose-500',
    bgGlowClass: 'from-rose-500/20 to-pink-600/20',
    imageUrl: cyberBoyImg,
  },
];

export const DEFAULT_AVATAR = PLAYER_AVATARS[0];

export function getAvatarById(avatarId?: string | null): PlayerAvatar {
  if (!avatarId) return DEFAULT_AVATAR;
  return PLAYER_AVATARS.find((a) => a.id === avatarId) || DEFAULT_AVATAR;
}

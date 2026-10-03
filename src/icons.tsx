import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'weight'
  | 'plus'
  | 'minus'
  | 'users'
  | 'target'
  | 'search'
  | 'barcode'
  | 'heart'
  | 'back'
  | 'forward'
  | 'close'
  | 'flame'
  | 'edit'
  | 'camera'
  | 'image';

type Props = { name: IconName; size?: number; color: string; fill?: string; strokeWidth?: number };

export function Icon({ name, size = 24, color, fill = 'none', strokeWidth = 2 }: Props) {
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode;
  switch (name) {
    case 'home':
      body = <Path {...common} d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />;
      break;
    case 'weight':
      body = (
        <>
          <Circle {...common} cx={12} cy={5} r={3} />
          <Path {...common} d="M6.5 8a2 2 0 0 0-1.9 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.93-2.54L19.4 9.5A2 2 0 0 0 17.48 8z" />
        </>
      );
      break;
    case 'plus':
      body = <Path {...common} d="M12 5v14M5 12h14" />;
      break;
    case 'minus':
      body = <Path {...common} d="M5 12h14" />;
      break;
    case 'users':
      body = (
        <>
          <Path {...common} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <Circle {...common} cx={9} cy={7} r={4} />
          <Path {...common} d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      );
      break;
    case 'target':
      body = (
        <>
          <Circle {...common} cx={12} cy={12} r={10} />
          <Circle {...common} cx={12} cy={12} r={6} />
          <Circle {...common} cx={12} cy={12} r={2} />
        </>
      );
      break;
    case 'search':
      body = (
        <>
          <Circle {...common} cx={11} cy={11} r={8} />
          <Path {...common} d="m21 21-4.3-4.3" />
        </>
      );
      break;
    case 'barcode':
      body = <Path {...common} d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 7v10M12 7v10M16 7v10" />;
      break;
    case 'heart':
      body = (
        <Path
          {...common}
          fill={fill}
          d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"
        />
      );
      break;
    case 'back':
      body = <Path {...common} d="m15 18-6-6 6-6" />;
      break;
    case 'forward':
      body = <Path {...common} d="m9 18 6-6-6-6" />;
      break;
    case 'close':
      body = <Path {...common} d="M18 6 6 18M6 6l12 12" />;
      break;
    case 'flame':
      body = (
        <Path
          {...common}
          d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        />
      );
      break;
    case 'edit':
      body = <Path {...common} d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />;
      break;
    case 'camera':
      body = (
        <>
          <Path {...common} d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
          <Circle {...common} cx={12} cy={13} r={3} />
        </>
      );
      break;
    case 'image':
      body = (
        <>
          <Path {...common} d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <Circle {...common} cx={9} cy={9} r={2} />
          <Path {...common} d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </>
      );
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

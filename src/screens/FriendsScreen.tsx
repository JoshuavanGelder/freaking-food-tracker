import React from 'react';
import { C } from '../theme';
import { Empty, H1, Screen, T } from '../ui';

export function FriendsScreen() {
  return (
    <Screen withTabBar>
      <H1>Vrienden</H1>
      <Empty
        title="Komt in fase 3"
        text="Hier zie je straks de voortgang van je broer en andere vrienden: streaks, % van het dagdoel en samen uitdagingen doen. Gewicht en eetlog blijven privé."
      />
      <T size={12} color={C.muted} style={{ textAlign: 'center' }}>
        Eerst maken we de app goed voor jezelf.
      </T>
    </Screen>
  );
}

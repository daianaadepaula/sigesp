import {
  RefrigeratedVault,
  VaultDoorState,
  VaultLockState,
  VaultSensorStatus,
} from '../types/cofre';

/**
 * Interface substituível de integração com hardware de cofre refrigerado.
 * Nesta Prova de Conceito, a implementação padrão é exclusivamente simulada em memória/navegador.
 * Em implantação futura, pode ser substituída por cliente MQTT/Modbus/API REST do controlador físico.
 */
export interface VaultControllerGateway {
  readonly mode: 'simulado';
  readonly disclaimer: string;
  requestUnlock(vault: RefrigeratedVault): { lockState: VaultLockState };
  simulateDoorTransition(vault: RefrigeratedVault, nextDoor: VaultDoorState): {
    doorState: VaultDoorState;
    lockState: VaultLockState;
  };
  readTelemetry(vault: RefrigeratedVault): {
    tempC: number | null;
    sensorStatus: VaultSensorStatus;
    timestamp: string;
  };
}

export class SimulatedVaultGateway implements VaultControllerGateway {
  readonly mode = 'simulado' as const;
  readonly disclaimer = 'Integração com equipamento simulada nesta prova de conceito';

  requestUnlock(vault: RefrigeratedVault): { lockState: VaultLockState } {
    if (vault.sensorStatus === 'desconectado') {
      return { lockState: vault.lockState };
    }
    return { lockState: 'liberada_para_abertura' };
  }

  simulateDoorTransition(_vault: RefrigeratedVault, nextDoor: VaultDoorState): {
    doorState: VaultDoorState;
    lockState: VaultLockState;
  } {
    if (nextDoor === 'aberta') {
      return { doorState: 'aberta', lockState: 'destravada' };
    }
    return { doorState: 'fechada', lockState: 'travada' };
  }

  readTelemetry(vault: RefrigeratedVault): {
    tempC: number | null;
    sensorStatus: VaultSensorStatus;
    timestamp: string;
  } {
    return {
      tempC: vault.sensorStatus === 'desconectado' ? null : vault.currentTempC,
      sensorStatus: vault.sensorStatus,
      timestamp: new Date().toISOString(),
    };
  }
}

export const defaultVaultGateway: VaultControllerGateway = new SimulatedVaultGateway();

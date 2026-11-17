export interface TotalesConsumoDto {
  llamadas: number;
  tokensEntrada: number;
  tokensSalida: number;
  tokensTotal: number;
}

export interface ConsumoPorProveedorDto extends TotalesConsumoDto {
  proveedor: string;
}

export interface ConsumoPorModeloDto extends TotalesConsumoDto {
  proveedor: string;
  modelo: string;
}

export interface ConsumoPorOrigenDto extends TotalesConsumoDto {
  origen: string;
}

export interface ResumenConsumoDto {
  desde: string;
  hasta: string;
  total: TotalesConsumoDto;
  porProveedor: ConsumoPorProveedorDto[];
  porModelo: ConsumoPorModeloDto[];
  porOrigen: ConsumoPorOrigenDto[];
}

export interface RegistroConsumoDto {
  registrado: boolean;
  dia: string;
}

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsuarioPerfilDto } from './dto/usuario-perfil.dto';

export interface CrearUsuarioConPersonaParams {
  nombre: string;
  apellido: string;
  gmail: string;
  username: string;
  hashContrasena: string;
}

/**
 * Servicio encargado de la persistencia y consultas del dominio de Usuarios y Personas.
 * Garantiza integridad mediante transacciones atómicas y exclusión de datos confidenciales.
 */
@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea atómicamente una Persona y un Usuario vinculados dentro de una transacción de Prisma.
   * Si cualquiera de las dos entidades falla o hay duplicados, se revierte toda la operación.
   *
   * @param params Datos requeridos para la persona y el usuario con contraseña ya hasheada.
   * @returns Perfil público seguro del usuario recién creado.
   */
  async crearUsuarioConPersona(
    params: CrearUsuarioConPersonaParams,
  ): Promise<UsuarioPerfilDto> {
    const { nombre, apellido, gmail, username, hashContrasena } = params;

    // Verificación de unicidad previa para emitir mensajes descriptivos
    const existeUsername = await this.prisma.usuario.findUnique({
      where: { username },
      select: { id: true },
    });
    if (existeUsername) {
      this.logger.warn(
        `Intento de registro con username ya existente: ${username}`,
      );
      throw new ConflictException('El nombre de usuario ya está registrado.');
    }

    const existeGmail = await this.prisma.persona.findUnique({
      where: { gmail },
      select: { id: true },
    });
    if (existeGmail) {
      this.logger.warn(`Intento de registro con correo ya existente: ${gmail}`);
      throw new ConflictException(
        'El correo electrónico ya se encuentra registrado.',
      );
    }

    // Transacción atómica en Neon Postgres
    const usuarioCreado = await this.prisma.$transaction(async (tx) => {
      const persona = await tx.persona.create({
        data: {
          nombre,
          apellido,
          gmail,
        },
      });

      const usuario = await tx.usuario.create({
        data: {
          username,
          hashContrasena,
          personaId: persona.id,
        },
        select: {
          id: true,
          username: true,
          persona: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              gmail: true,
            },
          },
        },
      });

      return usuario;
    });

    this.logger.log(
      `Usuario creado exitosamente: ${usuarioCreado.username} (ID: ${usuarioCreado.id})`,
    );

    return {
      id: usuarioCreado.id,
      username: usuarioCreado.username,
      persona: usuarioCreado.persona,
    };
  }

  /**
   * Busca un usuario por su nombre de usuario, incluyendo el hash de la contraseña para verificación interna.
   * Esta función es estrictamente para uso de AuthService y nunca debe enviarse directamente a clientes.
   */
  async buscarPorUsernameParaAutenticacion(username: string) {
    return this.prisma.usuario.findUnique({
      where: { username },
      include: {
        persona: true,
      },
    });
  }

  /**
   * Busca un usuario por su correo electrónico, incluyendo el hash para verificación de login con email.
   * Exclusivo para uso interno del módulo de autenticación.
   */
  async buscarPorGmailParaAutenticacion(gmail: string) {
    const persona = await this.prisma.persona.findUnique({
      where: { gmail },
      include: {
        usuario: {
          include: {
            persona: true,
          },
        },
      },
    });

    return persona?.usuario ?? null;
  }

  /**
   * Obtiene el perfil público y seguro de un usuario por su ID.
   *
   * @param id Identificador numérico del usuario.
   * @throws NotFoundException si el usuario no existe.
   */
  async obtenerPerfilPorId(id: number): Promise<UsuarioPerfilDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        persona: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            gmail: true,
          },
        },
      },
    });

    if (!usuario) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
    }

    return usuario;
  }

  /**
   * Busca hasta 10 usuarios por username o gmail para el flujo de
   * confirmación previo a agregar un colaborador.
   * Retorna perfiles públicos seguros, nunca el hash de contraseña.
   *
   * @param termino Texto parcial o completo de username o gmail.
   */
  async buscarParaColaboracion(termino: string): Promise<UsuarioPerfilDto[]> {
    const t = termino.trim();
    if (t.length < 2) {
      return [];
    }
    return this.prisma.usuario.findMany({
      where: {
        OR: [
          { username: { contains: t, mode: 'insensitive' } },
          { persona: { gmail: { contains: t, mode: 'insensitive' } } },
        ],
      },
      take: 10,
      select: {
        id: true,
        username: true,
        persona: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            gmail: true,
          },
        },
      },
    });
  }
}

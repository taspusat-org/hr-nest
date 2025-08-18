import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { dbMssql } from 'src/common/utils/db';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../common/mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { UtilsService } from 'src/utils/utils.service';
import { Ability } from 'src/common/interfaces/all.interface';
import { Users } from 'src/common/interfaces/users.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly utilsService: UtilsService,
  ) {}
  async login(credentials: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    cabang_id: number[];
    users: Users & { cabang_nama: string };
    accessTokenExpiresIn: number;
    accessTokenExpires: Date;
  }> {
    const { username, password } = credentials;

    // Fetch basic user data
    const user = await dbMssql('users')
      .select(
        'id',
        'username',
        'name',
        'password',
        'email',
        'statusaktif',
        'modifiedby',
        'karyawan_id',
        'cabang_id',
        'created_at',
        'updated_at',
      )
      .where({ username })
      .first();
    if (!user) {
      throw new UnauthorizedException('User Tidak ditemukan');
    }
    if (user?.statusaktif == '132') {
      throw new UnauthorizedException('AKUN TIDAK AKTIF');
    }
    const roles = await dbMssql('userrole')
      .where({ user_id: user.id })
      .pluck('role_id');

    const dataKaryawan = await this.utilsService.fetchKaryawanByUserId(user.id);
    const cabangKaryawan = await dbMssql('usercabang')
      .select('cabang_id')
      .where('user_id', user.id);
    console.log('cabangKaryawan', cabangKaryawan);
    const cabangIds: number[] = cabangKaryawan.map(
      ({ cabang_id }) => cabang_id,
    );
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Username atau password salah');
    }
    const { password: _, ...restUser } = user;
    const userWithoutPassword: Users & { cabang_nama: string } = {
      ...restUser,
      cabang_nama: dataKaryawan.cabang_nama,
      role_id: roles,
    };

    // Prepare JWT payload
    const payload = {
      sub: user.id,
      user: userWithoutPassword,
      cabang_id: cabangIds,
    };

    const accessTokenExpiresIn = 7200; // 15 seconds
    const accessTokenExpires = new Date(
      Date.now() + accessTokenExpiresIn * 1000,
    );
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessTokenExpiresIn,
    });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '1h' });

    return {
      accessToken,
      refreshToken,
      cabang_id: cabangIds,
      users: userWithoutPassword,
      accessTokenExpiresIn,
      accessTokenExpires,
    };
  }

  async register(data: RegisterDto): Promise<{ message: string }> {
    const { email, password, name, username } = data;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await dbMssql('users')
      .insert({ email, password: hashedPassword, name, username })
      .returning('*');

    if (!newUser || newUser.length === 0) {
      throw new Error('Gagal registrasi');
    }

    return { message: 'User registered successfully' };
  }

  async refreshToken(oldRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    cabang_id: string;
    users: Users & { cabang_nama: string };
    accessTokenExpiresIn: number;
    accessTokenExpires: Date;
  }> {
    try {
      // Decode the refresh token
      const decoded = this.jwtService.verify(oldRefreshToken);

      // Check if the refresh token is still valid
      if (!decoded || !decoded.sub) {
        throw new UnauthorizedException('Refresh token tidak valid');
      }

      // Fetch user data based on decoded payload
      const user = await dbMssql('users')
        .select(
          'id',
          'username',
          'name',
          'password',
          'email',
          'statusaktif',
          'modifiedby',
          'karyawan_id',
          'created_at',
          'updated_at',
        )
        .where('id', decoded.sub)
        .first();

      if (!user) {
        throw new UnauthorizedException('User tidak ditemukan');
      }

      const dataKaryawan = await this.utilsService.fetchKaryawanByUserId(
        user.id,
      );
      // Remove password and include cabang_nama in the returned user object
      const { password: _, ...restUser } = user;
      const userWithoutPassword: Users & { cabang_nama: string } = {
        ...restUser,
        cabang_nama: dataKaryawan.cabang_nama,
      };

      // Prepare JWT payload
      const payload = {
        sub: user.id,
        user: userWithoutPassword,
        cabang_id: dataKaryawan.cabang_id,
      };

      const accessTokenExpiresIn = 7200; // 2 hours
      const accessTokenExpires = new Date(
        Date.now() + accessTokenExpiresIn * 1000,
      );

      // Sign new access and refresh tokens
      const accessToken = this.jwtService.sign(payload, {
        expiresIn: accessTokenExpiresIn,
      });

      const refreshToken = this.jwtService.sign(payload, { expiresIn: '1h' });

      return {
        accessToken,
        refreshToken,
        cabang_id: dataKaryawan.cabang_id,
        users: userWithoutPassword,
        accessTokenExpiresIn,
        accessTokenExpires,
      };
    } catch (e) {
      console.error('Error refreshing token:', e);
      throw new UnauthorizedException('Refresh token tidak valid');
    }
  }

  async sendPasswordResetToken(username: string): Promise<{ message: string }> {
    const user = await dbMssql('users').where({ username }).first();

    if (!user) {
      throw new BadRequestException('User tidak ditemukan'); // Throwing an exception ensures proper status code
    }
    if (user?.statusaktif == '132') {
      throw new UnauthorizedException('AKUN TIDAK AKTIF');
    }
    // Return response with appropriate message if the email is not found
    if (!user.email) {
      throw new BadRequestException('Email tidak ditemukan'); // Throwing an exception ensures proper status code
    }

    const existingToken = await dbMssql('reset_tokens')
      .where({ email: user.email })
      .first();

    if (existingToken) {
      await dbMssql('reset_tokens').where({ email: user.email }).del();
    }

    const resetToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '1h' },
    );

    await dbMssql('reset_tokens').insert({
      email: user.email,
      token: resetToken,
    });

    await this.mailService.sendPasswordResetEmail(user, resetToken);

    return { message: `Password reset email has been sent to ${user.email}.` };
  }

  async resetPassword(data: ForgetPasswordDto): Promise<{ message: string }> {
    const { token, newPassword } = data;
    try {
      const decoded = this.jwtService.verify(token);
      const userId = decoded.sub;
      const email = decoded.email;

      const tokenRecord = await dbMssql('reset_tokens')
        .where({ email, token })
        .first();

      if (!tokenRecord) {
        throw new UnauthorizedException(
          'Token tidak valid atau telah kedaluwarsa',
        );
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const updatedUser = await dbMssql('users')
        .where({ id: userId })
        .update({ password: hashedPassword });

      if (!updatedUser) {
        throw new BadRequestException('Gagal memperbarui password');
      }

      await dbMssql('reset_tokens').where({ email, token }).del();

      return { message: 'Password reset successfully' };
    } catch (error) {
      throw new UnauthorizedException(
        'Token tidak valid atau telah kedaluwarsa',
      );
    }
  }
  async verifyResetToken(
    token: string,
  ): Promise<{ valid: boolean; message: string }> {
    let decoded: any;

    // 1. Cek signature & expiry JWT
    try {
      decoded = this.jwtService.verify(token);
    } catch (err) {
      return {
        valid: false,
        message: 'Token tidak valid atau telah kedaluwarsa',
      };
    }

    const { email } = decoded;

    // 2. Cek record di tabel reset_tokens
    const tokenRecord = await dbMssql('reset_tokens')
      .where({ email, token })
      .first();

    if (!tokenRecord) {
      return {
        valid: false,
        message: 'Token tidak valid atau telah kedaluwarsa',
      };
    }

    // 3. Semua OK
    return {
      valid: true,
      message: 'Token masih valid',
    };
  }

  async changePassword(
    id: number,
    newPassword: string,
  ): Promise<{ message: string }> {
    try {
      const user = await dbMssql('users').where('id', id).first();

      if (!user) {
        throw new BadRequestException('User not found');
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      const updatedUser = await dbMssql('users')
        .where('id', id)
        .update({ password: hashedNewPassword });

      if (!updatedUser) {
        throw new BadRequestException('Failed to update password');
      }

      return { message: 'Password updated successfully' };
    } catch (error) {
      console.error('Error changing password:', error);
      throw new BadRequestException('Error changing password');
    }
  }
}

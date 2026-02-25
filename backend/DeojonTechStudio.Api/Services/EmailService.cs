using System.Net;
using System.Net.Mail;

namespace DeojonTechStudio.Api.Services;

public class EmailService
{
    private readonly IConfiguration _configuration;

    public EmailService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task SendTempPasswordAsync(string email, string tempPassword)
    {
        var host = _configuration["EMAIL_SERVER_HOST"];
        var portValue = _configuration["EMAIL_SERVER_PORT"];
        var user = _configuration["EMAIL_SERVER_USER"];
        var password = _configuration["EMAIL_SERVER_PASSWORD"];
        var from = _configuration["EMAIL_FROM"] ?? user;

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Email configuration is missing.");
        }

        var port = int.TryParse(portValue, out var parsed) ? parsed : 587;

        using var client = new SmtpClient(host, port)
        {
            Credentials = new NetworkCredential(user, password),
            EnableSsl = true
        };

        using var message = new MailMessage
        {
            From = new MailAddress(from ?? user),
            Subject = "임시 비밀번호 안내",
            Body = $"임시 비밀번호: {tempPassword}\n로그인 후 비밀번호를 변경해주세요.",
            IsBodyHtml = false
        };

        message.To.Add(email);
        await client.SendMailAsync(message);
    }
}

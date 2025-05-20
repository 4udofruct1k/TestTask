package Enter_test;

import java.io.*;
import java.util.Random;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int bestRes = 100;
        File file = new File("bestRes.txt");

        try {
            if (!file.exists()) {
                file.createNewFile();
                System.out.println("Файл создан");
            }
            Scanner scanner = new Scanner(file);
            if (scanner.hasNextInt()) {
                bestRes = scanner.nextInt();
            }
        } catch (IOException e) {
            System.out.println("Ошибка при работе с файлом");
        }

        Random random = new Random();
        Scanner scanner = new Scanner(System.in);

        int compChoice = random.nextInt(100) + 1;
        int attNum = 0;
        boolean flag = false;
        while (!flag) {
            System.out.println("Введите число; если хотите увидеть количество попыток, то введите команду RESULT: ");
            if (scanner.hasNextInt()) {
                int plCh = scanner.nextInt();
                if (plCh == compChoice) {
                    attNum++;
                    System.out.println("Число попыток: " + attNum);
                    System.out.println("Загаданное число: " + compChoice);
                    if (bestRes > attNum) bestRes = attNum;
                    flag = true;
                } else if (plCh > compChoice) {
                    attNum++;
                    System.out.println("Не ожидал от тебя такого. Загаданное число меньше, брат");
                } else {
                    attNum++;
                    System.out.println("Я сам в шоке, но загаданное число больше, брат");
                }
            } else if (scanner.hasNextLine()) {
                String res = scanner.nextLine();
                if (res.equals("RESULT")) {
                    System.out.println("Текущее количество попыток: " + attNum);
                    System.out.println("Лучший результат: " + bestRes);
                }
            }
        }
        try {
            FileWriter writer = new FileWriter("bestRes.txt", false);
            writer.write(String.valueOf(bestRes));
            writer.close();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
